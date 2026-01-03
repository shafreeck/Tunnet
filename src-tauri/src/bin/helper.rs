use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fs;
use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::UnixListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const SOCKET_PATH: &str = "/var/run/tunnet.sock";

#[derive(Serialize, Deserialize, Debug)]
struct Request {
    command: String,
    payload: Option<String>, // JSON string of config
}

#[derive(Serialize, Deserialize, Debug)]
struct Response {
    status: String,
    message: String,
}

use std::fs::File;
use std::io::BufWriter;

// Global state to hold the running proxy process
struct AppState {
    proxy_process: Mutex<Option<Child>>,
    current_config_path: Mutex<Option<PathBuf>>,
    log_writer: Mutex<Option<BufWriter<File>>>,
}

fn main() -> Result<(), Box<dyn Error>> {
    // Simple logger
    println!("Tunnet Helper started");

    let log_path = PathBuf::from("/tmp/tunnet-helper.log");
    let log_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .ok()
        .map(|f| BufWriter::new(f));

    let app_state = Arc::new(AppState {
        proxy_process: Mutex::new(None),
        current_config_path: Mutex::new(None),
        log_writer: Mutex::new(log_file),
    });

    // Remove existing socket if present
    if Path::new(SOCKET_PATH).exists() {
        fs::remove_file(SOCKET_PATH)?;
    }

    let listener = UnixListener::bind(SOCKET_PATH)?;
    // After binding, we MUST set the socket permissions so the regular user app can write to it.
    // Since we're on Unix, we can use chmod.
    if let Err(e) = Command::new("chmod").arg("0666").arg(SOCKET_PATH).status() {
        eprintln!("Failed to set socket permissions: {}", e);
    }

    println!("Helper started, listening on {:?}", SOCKET_PATH);

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                let state = app_state.clone();
                thread::spawn(move || {
                    let mut request_str = String::new();
                    match stream.read_to_string(&mut request_str) {
                        Ok(size) => {
                            if size > 0 {
                                println!("Received {} bytes", size);
                                let response = match serde_json::from_str::<Request>(&request_str) {
                                    Ok(req) => handle_request(req, &state),
                                    Err(e) => Response {
                                        status: "error".into(),
                                        message: format!(
                                            "JSON error at {}: {}",
                                            e,
                                            request_str.get(..100).unwrap_or(&request_str)
                                        ),
                                    },
                                };

                                let response_str = serde_json::to_string(&response).unwrap();
                                if let Err(e) = stream.write_all(response_str.as_bytes()) {
                                    eprintln!("Failed to write response: {}", e);
                                }
                            }
                        }
                        Err(e) => eprintln!("Failed to read stream: {}", e),
                    }
                });
            }
            Err(e) => eprintln!("Connection failed: {}", e),
        }
    }

    Ok(())
}

#[derive(Serialize, Deserialize, Debug)]
struct StartPayload {
    config: String,
    core_path: String,
    working_dir: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct KillPortPayload {
    port: u16,
}

fn log(state: &Arc<AppState>, msg: &str) {
    let mut writer_guard = state.log_writer.lock().unwrap();
    if let Some(writer) = writer_guard.as_mut() {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let _ = writeln!(writer, "[{}] {}", timestamp, msg);
        // We do NOT flush here intentionally to benefit from buffering.
        // Operating system/libc will handle flushing.
    }
}

fn start_sing_box(payload: StartPayload, state: &Arc<AppState>) -> Response {
    let mut process_guard = state.proxy_process.lock().unwrap();
    let mut config_path_guard = state.current_config_path.lock().unwrap();

    log(state, "Start requested");

    let max_retries = 3;
    let mut retry_count = 0;

    // Retry loop for "resource busy" or startup failures
    loop {
        // 1. Cleanup Existing Process (Robust)
        if let Some(mut child) = process_guard.take() {
            log(state, "Killing existing process");
            let _ = child.kill();
            let _ = child.wait();
        }
        *config_path_guard = None;

        // 2. Write Config
        let config_path = PathBuf::from("/tmp/tunnet_config.json");
        if let Err(e) = fs::write(&config_path, &payload.config) {
            let err = format!("Failed to write config: {}", e);
            log(state, &err);
            return Response {
                status: "error".into(),
                message: err,
            };
        }

        // 3. Spawn Process with Piped I/O
        let spawn_result = Command::new(&payload.core_path)
            .args(&[
                "run",
                "-c",
                config_path.to_str().unwrap(),
                "-D",
                &payload.working_dir,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        match spawn_result {
            Ok(mut child) => {
                log(state, &format!("Sing-box spawned, PID {}", child.id()));

                // Wait briefly to check for immediate failure
                std::thread::sleep(std::time::Duration::from_millis(500));

                if let Ok(Some(status)) = child.try_wait() {
                    let mut err_msg = String::new();
                    if let Some(mut stderr) = child.stderr.take() {
                        use std::io::Read;
                        let _ = stderr.read_to_string(&mut err_msg);
                    }
                    if err_msg.is_empty() {
                        if let Some(mut stdout) = child.stdout.take() {
                            use std::io::Read;
                            let _ = stdout.read_to_string(&mut err_msg);
                        }
                    }

                    let exit_msg = format!(
                        "Proxy core exited prematurely with: {}. Logs:\n{}",
                        status, err_msg
                    );
                    log(state, &exit_msg);

                    return Response {
                        status: "error".into(),
                        message: exit_msg,
                    };
                }

                // Still running: Spawn threads to pipe logs to file for troubleshooting
                if let Some(stdout) = child.stdout.take() {
                    let state_clone = state.clone(); // Clone Arc for the new thread
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stdout);
                        for line in reader.lines() {
                            if let Ok(l) = line {
                                log(&state_clone, &format!("[Core STDOUT] {}", l));
                            }
                        }
                    });
                }
                if let Some(stderr) = child.stderr.take() {
                    let state_clone = state.clone(); // Clone Arc for the new thread
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stderr);
                        for line in reader.lines() {
                            if let Ok(l) = line {
                                log(&state_clone, &format!("[Core STDERR] {}", l));
                            }
                        }
                    });
                }

                *process_guard = Some(child);
                *config_path_guard = Some(config_path);
                return Response {
                    status: "success".into(),
                    message: "Proxy started".into(),
                };
            }
            Err(e) => {
                let err = format!(
                    "Failed to spawn sing-box (attempt {}): {}",
                    retry_count + 1,
                    e
                );
                log(state, &err);
                retry_count += 1;
                if retry_count >= max_retries {
                    return Response {
                        status: "error".into(),
                        message: err,
                    };
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        }
    }
}

fn kill_process_on_port(port: u16, state: &Arc<AppState>) -> Response {
    log(state, &format!("Kill port requested for port {}", port));
    // Find PIDs using lsof
    if let Ok(output) = Command::new("lsof")
        .args(&["-ti", &format!(":{}", port)])
        .output()
    {
        if output.status.success() {
            let pids = String::from_utf8_lossy(&output.stdout);
            if pids.trim().is_empty() {
                return Response {
                    status: "success".into(),
                    message: "No process found on port".into(),
                };
            }

            for pid_str in pids.lines() {
                if let Ok(pid) = pid_str.trim().parse::<u32>() {
                    log(state, &format!("Killing process {} on port {}", pid, port));
                    let _ = Command::new("kill")
                        .args(&["-9", &pid.to_string()])
                        .output();
                }
            }
            return Response {
                status: "success".into(),
                message: "Processes killed".into(),
            };
        }
    }

    Response {
        status: "success".into(),
        message: "No process found or lsof failed".into(),
    }
}

fn stop_sing_box(state: &Arc<AppState>) -> Response {
    let mut process_guard = state.proxy_process.lock().unwrap();
    if let Some(mut child) = process_guard.take() {
        log(state, "Stopping process gracefully...");

        let pid = child.id();
        let mut stopped = false;

        // 1. Try SIGTERM first
        #[cfg(unix)]
        {
            let _ = Command::new("kill")
                .arg("-TERM")
                .arg(pid.to_string())
                .status();
            // Wait up to 5s
            for _ in 0..50 {
                match child.try_wait() {
                    Ok(Some(_)) => {
                        stopped = true;
                        break;
                    }
                    Ok(None) => std::thread::sleep(std::time::Duration::from_millis(100)),
                    Err(_) => break,
                }
            }
        }

        // 2. Force Kill if still running
        if !stopped {
            log(state, "Process didn't exit, forcing KILL");
            let _ = child.kill();
            let _ = child.wait();
        } else {
            log(state, "Process exited gracefully");
        }

        let mut config_path_guard = state.current_config_path.lock().unwrap();
        *config_path_guard = None;

        Response {
            status: "success".into(),
            message: "Proxy stopped".into(),
        }
    } else {
        Response {
            status: "success".into(), // Idempotent
            message: "Proxy was not running".into(),
        }
    }
}

fn check_status(state: &Arc<AppState>) -> Response {
    let mut process_guard = state.proxy_process.lock().unwrap();
    if let Some(child) = process_guard.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                *process_guard = None; // Exited
                Response {
                    status: "stopped".into(),
                    message: "Process exited".into(),
                }
            }
            Ok(None) => Response {
                status: "running".into(),
                message: "Running".into(),
            },
            Err(_) => Response {
                status: "error".into(),
                message: "Error checking status".into(),
            },
        }
    } else {
        Response {
            status: "stopped".into(),
            message: "Not running".into(),
        }
    }
}

// Assuming a handle_request function exists elsewhere in the code
// This is a placeholder to show where the new match arm would go.
// In a real scenario, you'd insert this into the actual handle_request function.
fn handle_request(req: Request, state: &Arc<AppState>) -> Response {
    match req.command.as_str() {
        "start" => {
            if let Some(payload_str) = req.payload {
                // Try parsing as StartPayload
                match serde_json::from_str::<StartPayload>(&payload_str) {
                    Ok(payload) => start_sing_box(payload, state),
                    Err(_) => Response {
                        status: "error".into(),
                        message: "Invalid payload format for start".into(),
                    },
                }
            } else {
                Response {
                    status: "error".into(),
                    message: "Missing payload for start".into(),
                }
            }
        }

        "stop" => stop_sing_box(state),
        "status" => check_status(state),
        "version" => Response {
            status: "success".into(),
            message: "1.1.3".into(), // Bumped version for timeout increase
        },
        "kill_port" => {
            if let Some(payload_str) = req.payload {
                match serde_json::from_str::<KillPortPayload>(&payload_str) {
                    Ok(payload) => kill_process_on_port(payload.port, state),
                    Err(_) => Response {
                        status: "error".into(),
                        message: "Invalid payload for kill_port".into(),
                    },
                }
            } else {
                Response {
                    status: "error".into(),
                    message: "Missing payload for kill_port".into(),
                }
            }
        }
        _ => Response {
            status: "error".into(),
            message: format!("Unknown command: '{}'", req.command),
        },
    }
}
