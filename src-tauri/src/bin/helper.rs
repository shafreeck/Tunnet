use serde::{Deserialize, Serialize};
use std::error::Error;
use std::ffi::{CStr, CString};
use std::fs;
use std::io::{Read, Write};

use std::os::unix::net::UnixListener;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;

const SOCKET_PATH: &str = "/var/run/tunnet.sock";

use app_lib::libbox;

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
}

fn log(state: &Arc<AppState>, msg: &str) {
    let mut writer_guard = state.log_writer.lock().unwrap();
    if let Some(writer) = writer_guard.as_mut() {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let _ = writeln!(writer, "[{}] {}", timestamp, msg);
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    println!("Tunnet Helper (Libbox) started");

    let log_path = PathBuf::from("/tmp/tunnet-helper.log");
    let log_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .ok()
        .map(|f| BufWriter::new(f));

    let app_state = Arc::new(AppState {
        log_writer: Mutex::new(log_file),
        proxy_running: Mutex::new(false),
    });

    if Path::new(SOCKET_PATH).exists() {
        fs::remove_file(SOCKET_PATH)?;
    }

    let listener = UnixListener::bind(SOCKET_PATH)?;
    if let Err(e) = Command::new("chmod").arg("0666").arg(SOCKET_PATH).status() {
        eprintln!("Failed to set socket permissions: {}", e);
    }

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

    println!("Helper listening on {:?}", SOCKET_PATH);

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                let state = app_state.clone();
                thread::spawn(move || {
                    let mut request_str = String::new();
                    match stream.read_to_string(&mut request_str) {
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
                                let _ = stream.write_all(response_str.as_bytes());
                            }
                        }
                        Err(e) => log(&state, &format!("Read error: {}", e)),
                    }
                });
            }
            Err(e) => eprintln!("Accept error: {}", e),
        }
    }

    Ok(())
}

fn kill_all_singbox(state: &Arc<AppState>, core_path: &str) {
    let mut sys = sysinfo::System::new();
    sys.refresh_processes();

    let core_canon = Path::new(core_path).canonicalize().ok();
    let core_name = Path::new(core_path).file_name().and_then(|n| n.to_str());

    for process in sys.processes().values() {
        let exe_matches = process
            .exe()
            .map(|e| {
                core_canon
                    .as_ref()
                    .map_or(false, |c| e.canonicalize().ok().as_ref() == Some(c))
            })
            .unwrap_or(false);
        let name_matches = core_name.map_or(false, |n| process.name() == n);

        if exe_matches || name_matches {
            log(
                state,
                &format!(
                    "Cleaning up existing proxy instance (pid: {}, name: {})",
                    process.pid(),
                    process.name()
                ),
            );
            process.kill_with(sysinfo::Signal::Kill);
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct StartPayload {
    config: String,
    // working_dir and core_path are kept for compatibility with Request struct but ignored in FFI mode
    #[serde(default)]
    core_path: String,
    #[serde(default)]
    working_dir: String,
}

fn start_libbox(payload: StartPayload, state: &Arc<AppState>) -> Response {
    log(state, "Start Libbox requested");

    // Aggressive cleanup before starting new instance
    kill_all_singbox(state, &payload.core_path);

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

    unsafe {
        let err_ptr = libbox::LibboxStart(c_config.as_ptr());
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
            message: "2.0.12".into(),
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
