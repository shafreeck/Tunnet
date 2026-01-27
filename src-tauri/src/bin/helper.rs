use serde::{Deserialize, Serialize};
use std::error::Error;
use std::ffi::{CStr, CString};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

const SOCKET_PATH: &str = "/var/run/tunnet.sock";
#[cfg(windows)]
const PIPE_NAME: &str = r"\\.\pipe\tunnet";

use app_lib::libbox;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Serialize, Deserialize, Debug)]
struct Request {
    command: String,
    payload: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Response {
    status: String,
    message: String,
}

use std::fs::File;
use std::io::BufWriter;

struct AppState {
    log_writer: Mutex<Option<BufWriter<File>>>,
    proxy_running: Mutex<bool>,
    libbox_log_file: Mutex<Option<File>>,
}

fn log(state: &Arc<AppState>, msg: &str) {
    let mut writer_guard = state.log_writer.lock().unwrap();
    if let Some(writer) = writer_guard.as_mut() {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let _ = writeln!(writer, "[{}] {}", timestamp, msg);
        let _ = writer.flush();
    }
}

#[cfg(windows)]
use windows_service::{
    define_windows_service,
    service::{
        ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
        ServiceType,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
};

// Define the Windows Service entry point
#[cfg(windows)]
define_windows_service!(ffi_service_main, tunnet_helper_service_main);

#[cfg(windows)]
fn tunnet_helper_service_main(_arguments: Vec<std::ffi::OsString>) {
    if let Err(e) = run_service() {
        // Log the error - since we're in service mode, logs go to event viewer or file
        eprintln!("Service error: {}", e);
    }
}

#[cfg(windows)]
fn run_service() -> Result<(), Box<dyn Error>> {
    use std::sync::mpsc;
    use std::time::Duration;

    let (shutdown_tx, shutdown_rx) = mpsc::channel();

    // Register service control handler
    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop | ServiceControl::Shutdown => {
                // Signal shutdown
                let _ = shutdown_tx.send(());
                ServiceControlHandlerResult::NoError
            }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle = service_control_handler::register("TunnetHelper", event_handler)?;

    // Tell Windows we're starting
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::StartPending,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::from_secs(5),
        process_id: None,
    })?;

    // Initialize the service
    let rt = tokio::runtime::Runtime::new()?;
    let app_state = rt.block_on(async { initialize_app_state().await })?;

    // Tell Windows we're running
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    // Run the listener in a separate thread
    let listener_handle = std::thread::spawn(move || {
        rt.block_on(async {
            if let Err(e) = run_listener(app_state).await {
                eprintln!("Listener error: {}", e);
            }
        });
    });

    // Wait for shutdown signal
    let _ = shutdown_rx.recv();

    // Tell Windows we're stopping
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::StopPending,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::from_secs(5),
        process_id: None,
    })?;

    // TODO: Gracefully shutdown the listener
    // For now, we'll just wait a bit for it to finish
    listener_handle.join().ok();

    // Tell Windows we've stopped
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    Ok(())
}

// Extract initialization logic into a separate async function
async fn initialize_app_state() -> Result<Arc<AppState>, Box<dyn Error>> {
    // Windows: Set DLL search path for libbox.dll and wintun.dll
    #[cfg(windows)]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                // Helper is in resources/bin, DLLs are in the same directory
                let bin_dir = exe_dir;

                // Also check parent's resources/bin (for bundled app structure)
                let alt_bin_dir = exe_dir.parent().map(|p| p.join("resources").join("bin"));

                // Update PATH for wintun.dll (Go runtime needs this)
                let path_key = "PATH";
                if let Ok(current_path) = std::env::var(path_key) {
                    let mut new_path = format!("{}", bin_dir.display());
                    if let Some(ref alt) = alt_bin_dir {
                        if alt.exists() {
                            new_path = format!("{};{}", alt.display(), new_path);
                        }
                    }
                    new_path = format!("{};{}", new_path, current_path);
                    std::env::set_var(path_key, new_path);
                }

                // Set DLL directory for libbox.dll
                unsafe {
                    use std::os::windows::ffi::OsStrExt;
                    #[link(name = "kernel32")]
                    extern "system" {
                        fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
                    }
                    let mut path_u16: Vec<u16> = bin_dir.as_os_str().encode_wide().collect();
                    path_u16.push(0);
                    SetDllDirectoryW(path_u16.as_ptr());
                }
            }
        }
    }

    println!("Tunnet Helper (Libbox) started");

    let log_path = if cfg!(windows) {
        PathBuf::from(std::env::var("ProgramData").unwrap_or("C:\\ProgramData".into()))
            .join("Tunnet")
            .join("tunnet-helper.log")
    } else {
        PathBuf::from("/tmp/tunnet-helper.log")
    };

    let log_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok()
        .map(|f| BufWriter::new(f));

    let app_state = Arc::new(AppState {
        log_writer: Mutex::new(log_file),
        proxy_running: Mutex::new(false),
        libbox_log_file: Mutex::new(None),
    });

    // Verify Libbox linkage
    unsafe {
        let hello_ptr = libbox::LibboxHello();

        if !hello_ptr.is_null() {
            let hello = CStr::from_ptr(hello_ptr).to_string_lossy();
            log(
                &app_state,
                &format!("Libbox linked successfully: {}", hello),
            );
        }
    }

    Ok(app_state)
}

// Main entry point
#[cfg(windows)]
fn main() -> Result<(), Box<dyn Error>> {
    // Early debug logging for service startup
    if cfg!(windows) {
        let log_path = std::path::PathBuf::from(
            std::env::var("ProgramData").unwrap_or("C:\\ProgramData".into()),
        )
        .join("Tunnet")
        .join("early_debug.log");

        // Setup panic hook to catch crashes
        std::panic::set_hook(Box::new(move |info| {
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
            {
                let _ = writeln!(f, "PANIC: {:?}", info);
            }
        }));

        // Log startup
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(
            std::path::PathBuf::from(
                std::env::var("ProgramData").unwrap_or("C:\\ProgramData".into()),
            )
            .join("Tunnet")
            .join("early_debug.log"),
        ) {
            let _ = writeln!(
                f,
                "Helper process starting... Args: {:?}",
                std::env::args().collect::<Vec<_>>()
            );
        }
    }

    // Check for installation flag
    let args: Vec<String> = std::env::args().collect();
    #[cfg(target_os = "windows")]
    if args.len() > 1 && args[1] == "service-install" {
        // We act as the installer (running as Admin)
        println!("Installing Tunnet Helper Service...");

        let exe_path = std::env::current_exe()?;
        let bin_path_arg = format!("binPath=\"{}\"", exe_path.display());

        // 1. Create service (ignore error if exists)
        // CREATE_NO_WINDOW = 0x08000000
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let _ = std::process::Command::new("sc.exe")
            .args(&[
                "create",
                "TunnetHelper",
                &bin_path_arg,
                "start=auto",
                "DisplayName=Tunnet Helper Service",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        // 2. Config service (force update path)
        let _ = std::process::Command::new("sc.exe")
            .args(&["config", "TunnetHelper", &bin_path_arg, "start=auto"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        // 3. Set description
        let _ = std::process::Command::new("sc.exe")
            .args(&[
                "description",
                "TunnetHelper",
                "Provides TUN interface support for Tunnet proxy",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        // 4. Start service
        let output = std::process::Command::new("sc.exe")
            .args(&["start", "TunnetHelper"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()?;

        if !output.status.success() {
            // It's okay if already running, but let's log stderr just in case
            let err = String::from_utf8_lossy(&output.stderr);
            if !err.contains("An instance of the service is already running") {
                // return Err(format!("Failed to start service: {}", err).into());
                // Don't error out, let verification step handle it
            }
        }

        println!("Service installation commands executed.");
        return Ok(());
    } else if args.len() > 2 && args[1] == "service-update" {
        // service-update <target_dir>
        // Use this to update the service binary from a temporary location (e.g. resources)
        // This avoids "Text file busy" or locked file issues by ensuring service is stopped first.
        let target_dir = std::path::PathBuf::from(&args[2]);
        println!("Updating Tunnet Helper Service to {:?}...", target_dir);

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // 1. Stop service
        println!("Stopping service...");
        let _ = std::process::Command::new("sc.exe")
            .args(&["stop", "TunnetHelper"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        // Wait for stop (simple polling)
        std::thread::sleep(std::time::Duration::from_secs(2));

        // 2. Ensure target dir exists
        if !target_dir.exists() {
            let _ = std::fs::create_dir_all(&target_dir);
        }

        // 3. Copy files (Self + DLLs)
        let current_exe = std::env::current_exe()?;
        let current_dir = current_exe.parent().unwrap();

        let files = ["tunnet-helper.exe", "libbox.dll", "wintun.dll"];
        for file in files.iter() {
            let src = current_dir.join(file);
            let dest = target_dir.join(file);
            if src.exists() {
                println!("Copying {:?} to {:?}", src, dest);
                if let Err(e) = std::fs::copy(&src, &dest) {
                    eprintln!("Failed to copy {}: {}", file, e);
                    // Try to proceed, maybe DLLs are fine
                }
            } else {
                eprintln!("Source file not found: {:?}", src);
            }
        }

        // 4. Call service-install on the NEW binary
        let new_binary = target_dir.join("tunnet-helper.exe");
        println!("Executing service-install on new binary: {:?}", new_binary);

        // We use a separate process for this to ensure we are running the installed binary
        let status = std::process::Command::new(&new_binary)
            .arg("service-install")
            .creation_flags(CREATE_NO_WINDOW)
            .status()?;

        if !status.success() {
            return Err("Failed to execute service-install".into());
        }

        println!("Service update completed.");
        return Ok(());
    }

    // On Windows, dispatch to the service control manager
    service_dispatcher::start("TunnetHelper", ffi_service_main)?;
    Ok(())
}

#[cfg(not(windows))]
#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let app_state = initialize_app_state().await?;
    run_listener(app_state).await
}

#[cfg(unix)]
async fn run_listener(app_state: Arc<AppState>) -> Result<(), Box<dyn Error>> {
    use tokio::net::UnixListener;

    if Path::new(SOCKET_PATH).exists() {
        fs::remove_file(SOCKET_PATH)?;
    }

    let listener = UnixListener::bind(SOCKET_PATH)?;
    if let Err(e) = Command::new("chmod").arg("0666").arg(SOCKET_PATH).status() {
        eprintln!("Failed to set socket permissions: {}", e);
    }

    println!("Helper listening on Unix socket: {:?}", SOCKET_PATH);

    loop {
        match listener.accept().await {
            Ok((mut stream, _)) => {
                let state = app_state.clone();
                tokio::spawn(async move {
                    let mut request_str = String::new();
                    match stream.read_to_string(&mut request_str).await {
                        Ok(size) => {
                            if size > 0 {
                                let response = match serde_json::from_str::<Request>(&request_str) {
                                    Ok(req) => handle_request(req, &state),
                                    Err(e) => Response {
                                        status: "error".into(),
                                        message: format!("JSON error: {}", e),
                                    },
                                };
                                let response_str = serde_json::to_string(&response).unwrap();
                                let _ = stream.write_all(response_str.as_bytes()).await;
                            }
                        }
                        Err(e) => log(&state, &format!("Read error: {}", e)),
                    }
                });
            }
            Err(e) => eprintln!("Accept error: {}", e),
        }
    }
}

#[cfg(windows)]
async fn run_listener(app_state: Arc<AppState>) -> Result<(), Box<dyn Error>> {
    use std::os::windows::io::FromRawHandle;
    use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

    log(
        &app_state,
        &format!("Helper listening on Named Pipe: {}", PIPE_NAME),
    );
    println!("Helper listening on Named Pipe: {}", PIPE_NAME);

    // Create the first Named Pipe instance with permissive security
    // This allows non-admin processes to connect to admin-created pipe
    let mut server = create_named_pipe_with_security(PIPE_NAME, true)?;
    // Pipe created successfully

    loop {
        // Waiting for connection (removed high-frequency log)

        // Wait for a client to connect
        if let Err(e) = server.connect().await {
            log(&app_state, &format!("Failed to accept connection: {}", e));
            continue;
        }

        // Client connected (log only on errors)

        let state = app_state.clone();

        // Create the next server instance before handling the current connection
        let next_server = match create_named_pipe_with_security(PIPE_NAME, false) {
            Ok(s) => s,
            Err(e) => {
                log(
                    &state,
                    &format!("Failed to create next pipe instance: {}", e),
                );
                // Try to continue with the current connection
                handle_connection(server, state).await;
                return Err(e);
            }
        };

        // Spawn handler for current connection and swap servers
        let current_server = std::mem::replace(&mut server, next_server);
        tokio::spawn(async move {
            handle_connection(current_server, state).await;
        });
    }
}

#[cfg(windows)]
async fn handle_connection(
    server: tokio::net::windows::named_pipe::NamedPipeServer,
    state: Arc<AppState>,
) {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    // Split the server into read and write halves
    // But NamedPipeServer doesn't support split() directly like TcpStream
    // We can use the server for both, but need to be careful with ownership
    // BufReader takes ownership of the reader

    // Actually NamedPipeServer implements AsyncRead and AsyncWrite.
    // We can wrap it in BufReader, but then we can't write to it easily if BufReader owns it.
    // We should probably just read into a buffer until newline manually or use existing utilities.

    // Better approach: wrap server in BufReader, read line, then get inner server back?
    // No, into_inner() is sync.

    // Let's use a meaningful buffer size and read until we find a newline
    let mut reader = BufReader::new(server);
    let mut request_str = String::new();

    match reader.read_line(&mut request_str).await {
        Ok(size) => {
            // Received request
            if size > 0 {
                let response = match serde_json::from_str::<Request>(&request_str) {
                    Ok(req) => handle_request(req, &state),
                    Err(e) => Response {
                        status: "error".into(),
                        message: format!("JSON error: {}", e),
                    },
                };
                let mut response_str = serde_json::to_string(&response).unwrap();
                response_str.push('\n'); // Append newline for delimiters
                                         // Sending response

                // We need to write back to the server.
                // We can get the inner server from BufReader via .get_mut() or .into_inner()
                let mut server = reader.into_inner();
                let _ = server.write_all(response_str.as_bytes()).await;
                let _ = server.flush().await; // CRITICAL: Flush to ensure client receives response immediately
            }
        }
        Err(e) => log(&state, &format!("Read error: {}", e)),
    }
}

/// Create a Named Pipe with a NULL DACL security descriptor
/// This allows any user (including non-admin) to connect to the pipe
#[cfg(windows)]
fn create_named_pipe_with_security(
    pipe_name: &str,
    first_instance: bool,
) -> Result<tokio::net::windows::named_pipe::NamedPipeServer, Box<dyn Error>> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    // Windows constants
    const PIPE_ACCESS_DUPLEX: u32 = 0x00000003;
    const FILE_FLAG_OVERLAPPED: u32 = 0x40000000;
    const FILE_FLAG_FIRST_PIPE_INSTANCE: u32 = 0x00080000;
    const PIPE_TYPE_BYTE: u32 = 0x00000000;
    const PIPE_READMODE_BYTE: u32 = 0x00000000;
    const PIPE_WAIT: u32 = 0x00000000;
    const PIPE_REJECT_REMOTE_CLIENTS: u32 = 0x00000008;
    const PIPE_UNLIMITED_INSTANCES: u32 = 255;
    const INVALID_HANDLE_VALUE: isize = -1;

    #[repr(C)]
    struct SECURITY_ATTRIBUTES {
        n_length: u32,
        lp_security_descriptor: *mut std::ffi::c_void,
        b_inherit_handle: i32,
    }

    #[repr(C)]
    struct SECURITY_DESCRIPTOR {
        revision: u8,
        sbz1: u8,
        control: u16,
        owner: *mut std::ffi::c_void,
        group: *mut std::ffi::c_void,
        sacl: *mut std::ffi::c_void,
        dacl: *mut std::ffi::c_void,
    }

    extern "system" {
        fn CreateNamedPipeW(
            lp_name: *const u16,
            dw_open_mode: u32,
            dw_pipe_mode: u32,
            n_max_instances: u32,
            n_out_buffer_size: u32,
            n_in_buffer_size: u32,
            n_default_time_out: u32,
            lp_security_attributes: *const SECURITY_ATTRIBUTES,
        ) -> isize;

        fn InitializeSecurityDescriptor(
            p_security_descriptor: *mut SECURITY_DESCRIPTOR,
            dw_revision: u32,
        ) -> i32;

        fn SetSecurityDescriptorDacl(
            p_security_descriptor: *mut SECURITY_DESCRIPTOR,
            b_dacl_present: i32,
            p_dacl: *const std::ffi::c_void,
            b_dacl_defaulted: i32,
        ) -> i32;

        fn GetLastError() -> u32;
    }

    let pipe_name_wide: Vec<u16> = OsStr::new(pipe_name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // Create a security descriptor with NULL DACL (allows everyone access)
    let mut sd: SECURITY_DESCRIPTOR = unsafe { std::mem::zeroed() };
    let sd_init = unsafe { InitializeSecurityDescriptor(&mut sd, 1) };
    if sd_init == 0 {
        return Err(format!("InitializeSecurityDescriptor failed: {}", unsafe {
            GetLastError()
        })
        .into());
    }

    // Set NULL DACL - this grants full access to everyone
    let dacl_set = unsafe { SetSecurityDescriptorDacl(&mut sd, 1, ptr::null(), 0) };
    if dacl_set == 0 {
        return Err(format!("SetSecurityDescriptorDacl failed: {}", unsafe {
            GetLastError()
        })
        .into());
    }

    let sa = SECURITY_ATTRIBUTES {
        n_length: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lp_security_descriptor: &mut sd as *mut _ as *mut std::ffi::c_void,
        b_inherit_handle: 0,
    };

    let mut open_mode = PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED;
    if first_instance {
        open_mode |= FILE_FLAG_FIRST_PIPE_INSTANCE;
    }

    let pipe_mode = PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS;

    let handle = unsafe {
        CreateNamedPipeW(
            pipe_name_wide.as_ptr(),
            open_mode,
            pipe_mode,
            PIPE_UNLIMITED_INSTANCES,
            65536, // output buffer size
            65536, // input buffer size
            0,     // default timeout
            &sa,
        )
    };

    if handle == INVALID_HANDLE_VALUE {
        let err = unsafe { GetLastError() };
        return Err(format!("CreateNamedPipeW failed with error {}", err).into());
    }

    // Convert raw handle to tokio NamedPipeServer
    // SAFETY: handle is valid and we're immediately wrapping it
    use std::os::windows::io::{FromRawHandle, RawHandle};
    let server = unsafe {
        tokio::net::windows::named_pipe::NamedPipeServer::from_raw_handle(handle as RawHandle)
    };

    // from_raw_handle returns Result for tokio types
    Ok(server?)
}

#[derive(Serialize, Deserialize, Debug)]
struct StartPayload {
    config: String,
    // working_dir and core_path are kept for compatibility with Request struct but ignored in FFI mode
    #[serde(default)]
    working_dir: String,
    #[serde(default)]
    log_path: String,
}

fn start_libbox(payload: StartPayload, state: &Arc<AppState>) -> Response {
    log(state, "Start Libbox requested");

    // We don't write config to file anymore, we pass it directly via memory!
    // But wait, the config might contain relative paths (geodatabase etc).
    // Sing-box usually resolves paths relative to Working Directory.
    // The FFI `LibboxStart` currently just calls `box.New`. `box.New` uses `Options`.
    // We might need to ensure paths in JSON are absolute, OR set CWD of the helper process.

    // Since we are running in the helper process, we can just chdir if needed,
    // or rely on absolute paths from the frontend (which Tunnet already does mostly).

    // Change working directory to ensure relative paths (cache.db, geoip.db) work
    if !payload.working_dir.is_empty() {
        if let Err(e) = std::env::set_current_dir(&payload.working_dir) {
            let msg = format!(
                "Failed to set working dir to {}: {}",
                payload.working_dir, e
            );
            log(state, &msg);
            return Response {
                status: "error".into(),
                message: msg,
            };
        }
        log(
            state,
            &format!("Changed working directory to {}", payload.working_dir),
        );
    }

    let c_config = match CString::new(payload.config) {
        Ok(c) => c,
        Err(_) => {
            return Response {
                status: "error".into(),
                message: "Config contains null byte".into(),
            }
        }
    };

    let mut log_fd = 0;

    if !payload.log_path.is_empty() {
        if let Some(parent) = Path::new(&payload.log_path).parent() {
            let _ = fs::create_dir_all(parent);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o777));
            }
        }
        match fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&payload.log_path)
        {
            Ok(file) => {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = file.set_permissions(fs::Permissions::from_mode(0o666));
                }

                #[cfg(unix)]
                {
                    use std::os::unix::io::AsRawFd;
                    log_fd = file.as_raw_fd() as i64;
                }
                #[cfg(windows)]
                {
                    use std::os::windows::io::AsRawHandle;
                    log_fd = file.as_raw_handle() as i64;
                }
                *state.libbox_log_file.lock().unwrap() = Some(file);
                log(state, &format!("Logging libbox to {}", payload.log_path));
            }
            Err(e) => {
                log(
                    state,
                    &format!("Failed to open log file {}: {}", payload.log_path, e),
                );
            }
        }
    }

    unsafe {
        let err_ptr = libbox::LibboxStart(c_config.as_ptr(), log_fd);
        if !err_ptr.is_null() {
            let err_msg = CStr::from_ptr(err_ptr).to_string_lossy().into_owned();
            log(state, &format!("LibboxStart failed: {}", err_msg));
            return Response {
                status: "error".into(),
                message: err_msg,
            };
        }
    }

    *state.proxy_running.lock().unwrap() = true;

    log(state, "LibboxStart success");
    Response {
        status: "success".into(),
        message: "Proxy started via Libbox".into(),
    }
}

fn stop_libbox(state: &Arc<AppState>) -> Response {
    log(state, "Stop Libbox requested");
    unsafe {
        let err_ptr = libbox::LibboxStop();
        if !err_ptr.is_null() {
            let err_msg = CStr::from_ptr(err_ptr).to_string_lossy().into_owned();
            log(state, &format!("LibboxStop failed: {}", err_msg));
            // Even if stop failed, we might consider it stopped or in inconsistent state
            // and we still reset the flag to allow retry.
            *state.proxy_running.lock().unwrap() = false;
            return Response {
                status: "error".into(),
                message: err_msg,
            };
        }
    }
    *state.proxy_running.lock().unwrap() = false;
    *state.libbox_log_file.lock().unwrap() = None;

    log(state, "LibboxStop success");
    Response {
        status: "success".into(),
        message: "Proxy stopped".into(),
    }
}

// We can remove kill_process_on_port or keep it as a no-op / fallback if user port is held by someone else?
// But Libbox runs in-process. If Libbox fails to bind, it returns error.
// We can't kill "ourself" to free port.
// So we just return success/fail.

fn handle_request(req: Request, state: &Arc<AppState>) -> Response {
    match req.command.as_str() {
        "start" => {
            if let Some(payload_str) = req.payload {
                match serde_json::from_str::<StartPayload>(&payload_str) {
                    Ok(payload) => start_libbox(payload, state),
                    Err(_) => Response {
                        status: "error".into(),
                        message: "Invalid payload".into(),
                    },
                }
            } else {
                Response {
                    status: "error".into(),
                    message: "Missing payload".into(),
                }
            }
        }
        "stop" => stop_libbox(state),
        "status" => {
            let running = *state.proxy_running.lock().unwrap();
            Response {
                status: if running { "running" } else { "stopped" }.into(),
                message: if running {
                    "Proxy active"
                } else {
                    "Proxy inactive"
                }
                .into(),
            }
        }

        "version" => Response {
            status: "success".into(),
            message: env!("CARGO_PKG_VERSION").into(),
        },

        "kill_port" => Response {
            status: "success".into(),
            message: "Not needed in Libbox mode".into(),
        },
        _ => Response {
            status: "error".into(),
            message: "Unknown command".into(),
        },
    }
}
