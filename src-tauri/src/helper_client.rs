use serde::{Deserialize, Serialize};
use std::error::Error;

const SOCKET_PATH: &str = "/var/run/tunnet.sock";
#[cfg(windows)]
const PIPE_NAME: &str = r"\\.\pipe\tunnet";

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

#[derive(Serialize)]
struct StartPayload {
    config: String,
    core_path: String,
    working_dir: String,
    log_path: String,
}

pub struct HelperClient;

impl HelperClient {
    pub fn new() -> Self {
        Self
    }

    fn send_request(&self, req: Request) -> Result<Response, Box<dyn Error>> {
        let max_retries = 5;
        let mut retry_count = 0;
        let req_str = serde_json::to_string(&req)?;

        loop {
            let result = self.attempt_send(&req_str);
            match result {
                Ok(resp) => return Ok(resp),
                Err(e) => {
                    retry_count += 1;
                    if retry_count >= max_retries {
                        return Err(e);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            }
        }
    }

    #[cfg(unix)]
    fn attempt_send(&self, req_str: &str) -> Result<Response, Box<dyn Error>> {
        use std::io::{Read, Write};
        use std::os::unix::net::UnixStream;
        use std::time::Duration;

        let mut stream = UnixStream::connect(SOCKET_PATH)?;
        stream.set_read_timeout(Some(Duration::from_millis(1500)))?;
        stream.set_write_timeout(Some(Duration::from_millis(1500)))?;

        stream.write_all(req_str.as_bytes())?;
        stream.shutdown(std::net::Shutdown::Write)?;

        let mut resp_str = String::new();
        stream.read_to_string(&mut resp_str)?;
        if resp_str.is_empty() {
            return Err("Empty response from helper".into());
        }
        let resp: Response = serde_json::from_str(&resp_str)?;
        Ok(resp)
    }

    #[cfg(windows)]
    fn attempt_send(&self, req_str: &str) -> Result<Response, Box<dyn Error>> {
        use std::io::{BufRead, BufReader, Write};

        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(PIPE_NAME)?;

        // Write the request with a newline delimiter
        let mut req_with_newline = req_str.to_string();
        if !req_with_newline.ends_with('\n') {
            req_with_newline.push('\n');
        }

        file.write_all(req_with_newline.as_bytes())?;
        file.flush()?;

        // No need to shutdown write side anymore as we rely on newline delimiter

        // Read response until newline
        let mut reader = BufReader::new(file);
        let mut resp_str = String::new();
        reader.read_line(&mut resp_str)?;

        if resp_str.is_empty() {
            return Err("Empty response from helper".into());
        }

        // Trim potentially trailing newline
        let resp_json = resp_str.trim();
        let resp: Response = serde_json::from_str(resp_json)?;
        Ok(resp)
    }

    pub fn start_proxy(
        &self,
        config: String,
        core_path: String,
        working_dir: String,
        log_path: String,
    ) -> Result<(), Box<dyn Error>> {
        let payload = StartPayload {
            config,
            core_path,
            working_dir,
            log_path,
        };
        let payload_str = serde_json::to_string(&payload)?;

        let req = Request {
            command: "start".to_string(),
            payload: Some(payload_str),
        };
        let resp = self.send_request(req)?;
        if resp.status == "success" {
            Ok(())
        } else {
            Err(resp.message.into())
        }
    }

    pub fn stop_proxy(&self) -> Result<(), Box<dyn Error>> {
        let req = Request {
            command: "stop".to_string(),
            payload: None,
        };
        let resp = self.send_request(req)?;
        if resp.status == "success" {
            Ok(())
        } else {
            Err(resp.message.into())
        }
    }

    pub fn check_status(&self) -> Result<bool, Box<dyn Error>> {
        let req = Request {
            command: "status".to_string(),
            payload: None,
        };
        // If connection fails, it returns Err, which means not running (or socket issue)
        let resp = self.send_request(req)?;
        Ok(resp.status == "running")
    }

    pub fn get_version(&self) -> Result<String, Box<dyn Error>> {
        let req = Request {
            command: "version".to_string(),
            payload: None,
        };
        let resp = self.send_request(req)?;
        Ok(resp.message)
    }
}
