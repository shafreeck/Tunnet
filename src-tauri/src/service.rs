use crate::manager::CoreManager;
use log::{debug, error, info, warn};
use std::collections::HashSet;
use std::ffi::{CStr, CString};
use std::io::{BufRead, BufReader};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};


use crate::libbox;

#[derive(serde::Serialize, Clone, Debug)]
pub struct ProxyStatus {
    pub is_running: bool,
    pub node: Option<crate::profile::Node>, // Keep for compatibility, might be a virtual node for group
    pub target_id: Option<String>,
    pub target_name: Option<String>,
    pub target_type: Option<String>, // "node" or "group"
    pub tun_mode: bool,
    pub routing_mode: String,
    pub clash_api_port: Option<u16>,
}
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProxyNodeStatus {
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub alive: bool,
    pub udp: bool,
    pub xudp: bool,
    pub tfo: bool,
    pub delay: Option<u16>,
    pub now: Option<String>, // currently selected node name for selector
}
#[derive(serde::Serialize, Clone, Debug)]
pub struct LogEvent {
    pub source: String, // "local" or "helper"
    pub message: String,
}

pub struct ProxyService<R: Runtime> {
    app: AppHandle<R>,
    manager: CoreManager<R>,
    local_proxy_running: Mutex<bool>,
    tun_mode: Mutex<bool>,

    latest_node: Mutex<Option<crate::profile::Node>>,
    latest_routing_mode: Mutex<String>,
    clash_api_port: Mutex<Option<u16>>,
    start_lock: tokio::sync::Mutex<()>, // Ensure serialized start operations
    internal_client: reqwest::Client,
    active_network_services: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    local_log_fd: Mutex<Option<i64>>,
    log_running: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl<R: Runtime> ProxyService<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        let manager = CoreManager::new(app.clone());
        let internal_client = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .unwrap_or_default();

        let initial_tun_mode = manager.load_settings().map(|s| s.tun_mode).unwrap_or(false);

        Self {
            app: app.clone(),
            local_proxy_running: Mutex::new(false),
            tun_mode: Mutex::new(initial_tun_mode),
            latest_node: Mutex::new(None),
            latest_routing_mode: Mutex::new("rule".to_string()),
            clash_api_port: Mutex::new(None),
            start_lock: tokio::sync::Mutex::new(()),
            manager,
            internal_client,
            active_network_services: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
            local_log_fd: Mutex::new(None),
            log_running: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    pub fn init(&self) {
        // Synchronize initial log level
        if let Ok(settings) = self.manager.load_settings() {
            self.apply_log_level(&settings.log_level);
        }

        // Ensure helper cleans up too (in case of previous crash/TUN mode residue)
        crate::helper_client::HelperClient::new().stop_proxy().ok();
        self.warmup_network_cache();
    }

    pub async fn start_proxy(
        &self,
        node_opt: Option<crate::profile::Node>,
        tun_mode: bool,
        // mode: "global" | "rule" | "direct"
        routing_mode: String,
    ) -> Result<(), String> {
        info!("start_proxy: acquiring lock...");
        let _lock = self.start_lock.lock().await;
        info!("start_proxy: lock acquired, checking download...");

        info!("start_proxy: download check done, ensuring DBs...");
        self.manager.ensure_databases().await?;
        let core_path = std::path::PathBuf::new();
        let routing_mode = routing_mode.to_lowercase();
        let node_name = node_opt.as_ref().map(|n| n.name.as_str()).unwrap_or("None");

        info!(
            "start_proxy: tun={}, mode={}, node={}, current_internal_mode={:?}",
            tun_mode,
            routing_mode,
            node_name,
            self.latest_routing_mode.lock().unwrap()
        );
        let is_running = self.is_proxy_running();
        let prev_tun = *self.tun_mode.lock().unwrap();

        // Update state
        *self.latest_node.lock().unwrap() = node_opt.clone();
        *self.tun_mode.lock().unwrap() = tun_mode;
        *self.latest_routing_mode.lock().unwrap() = routing_mode.clone();

        // 4. Generate & Write Config
        self.stage_databases()?;

        // Generate Config
        // Note: We need settings for port allocation and system proxy retention checks
        let mut settings = match self.manager.load_settings() {
            Ok(s) => s,
            Err(e) => {
                error!("Failed to load settings: {}", e);
                crate::settings::AppSettings::default()
            }
        };

        // Sync tun_mode to settings if different (and persist if needed, but usually we just use the runtime arg)
        // Actually, start_proxy is the source of truth for "active" mode, so we should update settings to match request.
        if settings.tun_mode != tun_mode {
            info!("start_proxy: updating persisted tun_mode to {}", tun_mode);
            settings.tun_mode = tun_mode;
            if let Err(e) = self.manager.save_settings(&settings) {
                error!("Failed to persist tun_mode update: {}", e);
            }
        }

        // Synchronize log level
        self.apply_log_level(&settings.log_level);

        // Decision: Retain System Proxy?
        // We retain if:
        // 1. Proxy was running
        // 2. TUN mode matches previous state (switching modes might need clean slate)
        // 3. Mixed Port matches previous state (technically we can overwrite, but let's be safe)
        // Note: For now, we assume if is_running is true, we can retain.
        // enable_system_proxy will overwrite settings anyway if they changed.
        // The important part is avoiding 'disable'.
        // Retain only if tun_mode hasn't changed severely.
        let retain_system_proxy = is_running && (prev_tun == tun_mode);

        if is_running {
            info!(
                "Restarting proxy (retain_system_proxy={})...",
                retain_system_proxy
            );
        }

        // Full restart required (e.g., switched TUN mode or not running)
        info!("start_proxy: calling stop_proxy_internal...");
        self.stop_proxy_internal(false, retain_system_proxy).await;
        info!("start_proxy: stop_proxy_internal returned.");
        // Add a small delay to ensure ports are released (especially for Libbox FFI)
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Give OS a small grace period to release TUN interface resources
        // Reduced from 200ms to 50ms for optimization
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        // Allocate a dynamic port for Clash API with retries
        let mut clash_port = None;
        for _ in 0..3 {
            if let Ok(l) = std::net::TcpListener::bind("127.0.0.1:0") {
                if let Ok(addr) = l.local_addr() {
                    clash_port = Some(addr.port());
                    break;
                }
            }
        }

        if clash_port.is_none() {
            warn!(
                "Failed to allocate Clash API port using dynamic bind, using default fallback 9090"
            );
            clash_port = Some(9090);
        }

        if let Some(port) = clash_port {
            info!("Allocated Clash API port: {}", port);
        } else {
            warn!("Failed to allocate Clash API port");
        }

        *self.clash_api_port.lock().unwrap() = clash_port;

        // In Dual-Instance mode, we might need multiple configs.
        // For simplicity, we'll write the "helper" config if tun is requested,
        // and always write the "local" config.

        let config_file_path = self
            .app
            .path()
            .app_local_data_dir()
            .unwrap()
            .join("config.json");
        let helper_config_path = self
            .app
            .path()
            .app_local_data_dir()
            .unwrap()
            .join("helper_config.json");

        #[cfg(target_os = "windows")]
        {
            // Windows: Single Instance (Combined) Approach
            // We run everything in the main process (users must run as Admin for TUN).
            let mode = if tun_mode {
                crate::config::ConfigMode::Combined
            } else {
                crate::config::ConfigMode::SystemProxyOnly
            };

            self.write_config(
                node_opt.as_ref(),
                mode,
                &routing_mode,
                &settings,
                clash_port,
            )?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            // macOS/Linux: Dual Instance (Privileged Helper for TUN)
            if tun_mode {
                // Allocate a separate port for Helper API
                let mut helper_port = None;
                for _ in 0..3 {
                    if let Ok(l) = std::net::TcpListener::bind("127.0.0.1:0") {
                        if let Ok(addr) = l.local_addr() {
                            helper_port = Some(addr.port());
                            break;
                        }
                    }
                }
                if helper_port.is_none() {
                    // Fallback to clash_port + 1 (safe guess)
                    helper_port = clash_port.map(|p| p + 1);
                }

                info!("Allocated Helper API port: {:?}", helper_port);

                // CRITICAL FIX: In TUN mode, the frontend needs to connect to the HELPER's API port
                // to see traffic stats. We must update the shared state to reflect this.
                if let Some(hp) = helper_port {
                    *self.clash_api_port.lock().unwrap() = Some(hp);
                }

                self.write_config(
                    node_opt.as_ref(),
                    crate::config::ConfigMode::TunOnly,
                    &routing_mode,
                    &settings,
                    helper_port,
                )?;
                std::fs::rename(&config_file_path, &helper_config_path)
                    .map_err(|e| e.to_string())?;
            }

            self.write_config(
                node_opt.as_ref(),
                crate::config::ConfigMode::SystemProxyOnly,
                &routing_mode,
                &settings,
                clash_port,
            )?;
        }

        // Loop for retrying startup if port is temporarily held (TIME_WAIT race)
        let max_retries = 60;
        let mut last_error = String::new();

        for attempt in 1..=max_retries {
            if attempt > 1 {
                debug!("Retry attempt {} for proxy startup...", attempt);
            }

            let startup_result = async {
                // 1. Prepare local log pipe
                let (reader, writer) = os_pipe::pipe().map_err(|e| e.to_string())?;

                #[cfg(unix)]
                let log_fd = {
                    use std::os::unix::io::IntoRawFd;
                    writer.into_raw_fd() as i64
                };
                #[cfg(windows)]
                let log_fd = {
                    use std::os::windows::io::IntoRawHandle;
                    writer.into_raw_handle() as i64
                };

                // Store FD for reference (Go owns it now, we don't close it)
                *self.local_log_fd.lock().unwrap() = Some(log_fd);
                self.log_running
                    .store(true, std::sync::atomic::Ordering::SeqCst);

                // Spawn local log forwarder
                let app_clone = self.app.clone();
                let log_running_clone = self.log_running.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(reader);
                    for line in reader.lines() {
                        if !log_running_clone.load(std::sync::atomic::Ordering::SeqCst) {
                            break;
                        }
                        if let Ok(l) = line {
                            let _ = app_clone.emit(
                                "proxy-log",
                                LogEvent {
                                    source: "local".to_string(),
                                    message: l,
                                },
                            );
                        }
                    }
                    debug!("Local log forwarder terminated.");
                });

                // 2. Start Main App Proxy (Port Listener)
                info!("Starting local proxy instance (attempt {})...", attempt);
                let config_str =
                    std::fs::read_to_string(&config_file_path).map_err(|e| e.to_string())?;
                let c_config = CString::new(config_str).map_err(|_| "Config holds null bytes")?;

                unsafe {
                    let err_ptr = libbox::LibboxStart(c_config.as_ptr(), log_fd);
                    if !err_ptr.is_null() {
                        let err_msg = CStr::from_ptr(err_ptr).to_string_lossy().into_owned();
                        error!("Local LibboxStart failed: {}", err_msg);
                        return Err(err_msg);
                    }
                }
                *self.local_proxy_running.lock().unwrap() = true;

                // Make sure writer stays alive as long as Libbox needs it?
                // Actually Libbox Start returns, but the Go instance stays running.
                // Go's os.NewFile(fd) will keep the FD alive.
                // But Rust's `writer` will be dropped here.
                // We should probably leak the writer or keep it in the ProxyService.
                // Or Go's os.NewFile might duplicate the FD?
                // In Go, os.NewFile doesn't dup. It just wraps.
                // So if we drop `writer` in Rust, the FD is closed.
                // We must keep it alive.
                // Let's drop it explicitly after Stop.
                // But for now, let's just leak it or or put it in a global.

                // 3. Start TUN Instance (Specialized Port-less config) if requested
                // ON WINDOWS: We skipped generating helper_config, so we skip this block.
                #[cfg(not(target_os = "windows"))]
                if tun_mode {
                    info!(
                        "Starting specialized TUN instance via Helper (attempt {})...",
                        attempt
                    );
                    let client = crate::helper_client::HelperClient::new();
                    let helper_config_str =
                        std::fs::read_to_string(&helper_config_path).map_err(|e| e.to_string())?;

                    let helper_log_path = self
                        .app
                        .path()
                        .app_local_data_dir()
                        .unwrap()
                        .join("logs")
                        .join("helper.log");

                    // Ensure logs dir exists
                    if let Some(p) = helper_log_path.parent() {
                        let _ = std::fs::create_dir_all(p);
                    }

                    // Tailing Helper Log
                    let log_path_clone = helper_log_path.clone();
                    let app_clone = self.app.clone();
                    let log_running_clone = self.log_running.clone();
                    tokio::spawn(async move {
                        info!("Helper log tailer started for {:?}", log_path_clone);
                        
                        let mut file = None;
                        for i in 0..20 {
                            if !log_running_clone.load(std::sync::atomic::Ordering::SeqCst) {
                                return;
                            }
                            match tokio::fs::File::open(&log_path_clone).await {
                                Ok(f) => {
                                    file = Some(f);
                                    break;
                                }
                                Err(e) => {
                                    if i % 5 == 0 {
                                        debug!("Waiting for helper log file (attempt {}): {}. Path: {:?}", i, e, log_path_clone);
                                    }
                                }
                            }
                            tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                        }

                        if let Some(mut file) = file {
                            use tokio::io::{AsyncBufReadExt, AsyncSeekExt, BufReader as AsyncBufReader, SeekFrom};
                            let _ = file.seek(SeekFrom::End(0)).await;
                            let mut reader = AsyncBufReader::new(file);
                            loop {
                                if !log_running_clone.load(std::sync::atomic::Ordering::SeqCst) {
                                    break;
                                }
                                let mut line = String::new();
                                match reader.read_line(&mut line).await {
                                    Ok(0) => {
                                        tokio::time::sleep(tokio::time::Duration::from_millis(200))
                                            .await;
                                    }
                                    Ok(_) => {
                                        let message = line.trim();
                                        if !message.is_empty() {
                                            let _ = app_clone.emit(
                                                "proxy-log",
                                                LogEvent {
                                                    source: "helper".to_string(),
                                                    message: message.to_string(),
                                                },
                                            );
                                        }
                                    }
                                    Err(e) => {
                                        error!("Error reading helper log: {}", e);
                                        break;
                                    }
                                }
                            }
                        } else {
                            error!("Failed to open helper log file after 20 attempts. Path: {:?}", log_path_clone);
                        }
                        info!("Helper log tailer terminated.");
                    });

                    let result = client
                        .start_proxy(
                            helper_config_str,
                            core_path.to_string_lossy().to_string(),
                            self.app
                                .path()
                                .app_local_data_dir()
                                .unwrap()
                                .to_string_lossy()
                                .to_string(),
                            helper_log_path.to_string_lossy().to_string(),
                        )
                        .map_err(|e| e.to_string());

                    if let Err(e) = result {
                        error!("TUN Helpber start failed: {}", e);
                        // Clean up local proxy before retrying
                        unsafe {
                            libbox::LibboxStop();
                        }
                        *self.local_proxy_running.lock().unwrap() = false;
                        return Err(e);
                    }
                }

                if settings.system_proxy {
                    self.enable_system_proxy(settings.mixed_port);
                }

                // Wait for services to be ready
                if !self.wait_for_port(settings.mixed_port, 2000).await {
                    error!(
                        "Proxy port {} is not responding after startup.",
                        settings.mixed_port
                    );
                    self.stop_proxy_internal(false, retain_system_proxy).await;
                    return Err(format!("Proxy port {} not responding", settings.mixed_port));
                }

                if let Some(p) = clash_port {
                    if !self.wait_for_port(p, 2000).await {
                        error!("Clash API port {} is not responding.", p);
                        self.stop_proxy_internal(false, retain_system_proxy).await;
                        return Err(format!("Clash API port {} not responding", p));
                    }
                }

                let _ = self.app.emit("proxy-status-change", self.get_status());

                if let Some(node) = node_opt.as_ref() {
                    let node_id = node.id.clone();
                    let handle = self.app.clone();
                    tokio::spawn(async move {
                        if let Some(service) = handle.try_state::<ProxyService<R>>() {
                            let _ = service.probe_nodes_location(vec![node_id]).await;
                        }
                    });
                }

                Ok(())
            }
            .await;

            match startup_result {
                Ok(_) => return Ok(()),
                Err(e) => {
                    last_error = e.clone();
                    if e.contains("address already in use")
                        || e.contains("bind: address already in use")
                    {
                        warn!(
                            "Startup attempt {} failed: {}. Retrying in 500ms...",
                            attempt, e
                        );
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        continue;
                    }
                    return Err(e);
                }
            }
        }

        Err(format!(
            "Failed to start dual-instance proxy after {} attempts. Last error: {}",
            max_retries, last_error
        ))
    }

    pub async fn get_group_nodes(&self, group_id: &str) -> Result<Vec<ProxyNodeStatus>, String> {
        let _lock = self.start_lock.lock().await;
        if !self.is_proxy_running() {
            // Fallback: Calculate members from config without live status
            let groups = self.manager.load_groups().map_err(|e| e.to_string())?;
            let group = groups
                .iter()
                .find(|g| g.id == group_id)
                .ok_or("Group not found")?;

            let profiles = self.manager.load_profiles().map_err(|e| e.to_string())?;
            let mut all_nodes = Vec::new();
            for p in profiles {
                all_nodes.extend(p.nodes);
            }

            let member_ids = match &group.source {
                crate::profile::GroupSource::Static { node_ids } => node_ids.clone(),
                crate::profile::GroupSource::Filter { criteria } => {
                    let keywords = criteria.keywords.as_deref().unwrap_or(&[]);
                    all_nodes
                        .iter()
                        .filter(|n| {
                            if keywords.is_empty() {
                                return true;
                            }
                            keywords.iter().any(|k| n.name.contains(k))
                        })
                        .map(|n| n.id.clone())
                        .collect()
                }
            };

            let status_list = member_ids
                .into_iter()
                .filter_map(|id| {
                    // Try to find node to get name/type
                    all_nodes
                        .iter()
                        .find(|n| n.id == id)
                        .map(|n| ProxyNodeStatus {
                            name: n.id.clone(), // ID is used as name in backend status logic usually?
                            // Wait, previous logic uses `all_resp` keys which are IDs (from config generation).
                            // In `generate_singbox_config`, nodes are keyed by their IDs (uuid or generated).
                            // So name here should be ID.
                            node_type: n.protocol.clone(),
                            alive: false,
                            udp: true, // assumption
                            xudp: false,
                            tfo: false,
                            delay: None,
                            now: None,
                        })
                })
                .collect();
            return Ok(status_list);
        }

        let port = self
            .ensure_clash_port()
            .ok_or("Clash API port not available")?;

        // Optimization: Just get all proxies once to map statuses
        let all_url = format!("http://127.0.0.1:{}/proxies", port);
        let all_resp = self
            .internal_client
            .get(&all_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch group nodes from Clash API: {}", e))?
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Failed to parse Clash API response: {}", e))?;

        let proxies = all_resp
            .get("proxies")
            .and_then(|v| v.as_object())
            .ok_or("Invalid response")?;

        let group_info = proxies.get(group_id).ok_or("Group not found")?;
        let all_members = group_info
            .get("all")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let current_selected = group_info.get("now").and_then(|v| v.as_str()).unwrap_or("");

        let mut status_list = Vec::new();
        for member_name in all_members {
            if let Some(node_info) = proxies.get(&member_name) {
                // Try to parse delay history or last delay
                let history = node_info.get("history").and_then(|v| v.as_array());
                let last_delay = history
                    .and_then(|h| h.last())
                    .and_then(|entry| entry.get("delay").and_then(|d| d.as_u64()))
                    .map(|d| d as u16);

                status_list.push(ProxyNodeStatus {
                    name: member_name.clone(),
                    node_type: node_info
                        .get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown")
                        .to_string(),
                    alive: last_delay.map(|_| true).unwrap_or(false), // Rough estimation
                    udp: node_info
                        .get("udp")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                    xudp: node_info
                        .get("xudp")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                    tfo: node_info
                        .get("tfo")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                    delay: last_delay,
                    now: if member_name == current_selected {
                        Some(member_name.clone())
                    } else {
                        None
                    },
                });
            }
        }

        Ok(status_list)
    }

    pub async fn select_group_node(&self, group_id: &str, node_name: &str) -> Result<(), String> {
        let _lock = self.start_lock.lock().await;
        if !self.is_proxy_running() {
            return Err("Proxy is not running. Start proxy to select nodes.".to_string());
        }
        let port = self
            .ensure_clash_port()
            .ok_or("Clash API port not available")?;

        let payload = serde_json::json!({
            "name": node_name
        });

        let mut last_err = String::new();
        for _ in 0..3 {
            let url = format!(
                "http://127.0.0.1:{}/proxies/{}",
                port,
                urlencoding::encode(group_id)
            );
            let resp = self.internal_client.put(&url).json(&payload).send().await;

            match resp {
                Ok(res) if res.status().is_success() => {
                    // Persistence Logic: Update 'selected' field for ANY group.
                    // We load persisted groups first.
                    let mut groups = self.manager.load_groups().unwrap_or_default();

                    if let Some(g) = groups.iter_mut().find(|g| g.id == group_id) {
                        // Case A: User-defined group or already persisted implicit group
                        g.selected = Some(node_name.to_string());
                        if let Err(e) = self.manager.save_groups(&groups) {
                            warn!("Failed to persist group selection: {}", e);
                        } else {
                            info!(
                                "Persisted selection '{}' for group '{}'",
                                node_name, group_id
                            );
                        }
                    } else {
                        // Case B: Implicit group not yet persisted (first time selection)
                        // We need to fetch the full group definition from get_groups() which generates implicit ones
                        if let Ok(all_groups) = self.get_groups() {
                            if let Some(implicit_g) =
                                all_groups.into_iter().find(|g| g.id == group_id)
                            {
                                // Add to persisted list with new selection
                                let mut new_g = implicit_g.clone();
                                new_g.selected = Some(node_name.to_string());

                                // We only really need to save strict fields for implicit groups if we want to support overriding them fully?
                                // But saving the whole object is fine, get_groups merges it later or we just trust the saved one if it exists?
                                // Our get_groups logic:
                                // 1. Loads persisted.
                                // 2. Generates implicit.
                                // 3. Merges selected FROM persisted TO implicit.
                                // Wait, if we save it to groups.json, get_groups will load it as "persisted".
                                // But get_groups ALSO generates it as "implicit".
                                // We need to make sure we don't duplicate it in get_groups output.
                                //
                                // Let's check get_groups again.
                                // It loads groups (unwrap_or_default).
                                // Then it inserts Global/Sub/Region.
                                // If the ID already exists in loaded groups (because we saved it here),
                                // then we have a Duplicate ID problem unless get_groups handles it.
                                //
                                // Correct approach for Implicit Persist:
                                // We should probably NOT save the whole group to groups.json if it is implicit system group,
                                // OR we update get_groups to NOT generate implicit group if it exists in persisted list.
                                //
                                // Let's modify get_groups to dedup:
                                // implicit groups are added via push/insert.
                                //
                                // Ideally, valid groups.json should only contain User Defined groups + "Overlay" state for system groups.
                                // But our Group persistence is simple list.
                                //
                                // Let's stick to the current "Overlay" plan:
                                // 1. We SAVE the implicit group to groups.json (effectively converting it to persisted).
                                // 2. We MUST Fix get_groups to favor the persisted version or avoiding dupes.

                                groups.push(new_g);
                                if let Err(e) = self.manager.save_groups(&groups) {
                                    warn!("Failed to persist implicit group selection: {}", e);
                                } else {
                                    info!(
                                        "Persisted implicit group '{}' with selection '{}'",
                                        group_id, node_name
                                    );
                                }
                            }
                        }
                    }
                    return Ok(());
                }
                Ok(res) => {
                    last_err = format!(
                        "Failed to select node (HTTP {}): {:?}",
                        res.status(),
                        res.text().await.ok()
                    );
                }
                Err(e) => {
                    last_err = format!("Network error connecting to Clash API: {}", e);
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        }

        Err(last_err)
    }

    pub async fn get_group_status(&self, group_id: &str) -> Result<String, String> {
        let _lock = self.start_lock.lock().await;
        let port = self
            .ensure_clash_port()
            .ok_or("Clash API port not available")?;

        // URL encode the group_id (tag)
        let url = format!(
            "http://127.0.0.1:{}/proxies/{}",
            port,
            urlencoding::encode(group_id)
        );

        let mut last_err = String::new();
        for _ in 0..3 {
            let resp = self.internal_client.get(&url).send().await;
            match resp {
                Ok(res) if res.status().is_success() => {
                    if let Ok(json) = res.json::<serde_json::Value>().await {
                        if let Some(now) = json.get("now").and_then(|v| v.as_str()) {
                            return Ok(now.to_string());
                        }
                    }
                    last_err = "Status missing 'now' field".to_string();
                }
                Ok(res) => {
                    last_err = format!(
                        "Failed to get status (HTTP {}): {:?}",
                        res.status(),
                        res.text().await.ok()
                    );
                }
                Err(e) => {
                    last_err = format!("Network error: {}", e);
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        }

        Err(last_err)
    }

    fn ensure_clash_port(&self) -> Option<u16> {
        let mut port_lock = self.clash_api_port.lock().unwrap();
        if let Some(port) = *port_lock {
            return Some(port);
        }

        // Try to recover from config.json if the proxy is actually running
        if !self.is_proxy_running() {
            debug!("ensure_clash_port: proxy not running, cannot recover port");
            return None;
        }

        let mut config_file_path = self
            .app
            .path()
            .app_local_data_dir()
            .unwrap()
            .join("config.json");

        if *self.tun_mode.lock().unwrap() {
            // In TUN mode, prefer the helper config which has the traffic-monitoring API port
            let helper_path = self
                .app
                .path()
                .app_local_data_dir()
                .unwrap()
                .join("helper_config.json");
            if helper_path.exists() {
                config_file_path = helper_path;
                debug!("ensure_clash_port: checking helper_config.json for API port");
            }
        }

        if let Ok(content) = std::fs::read_to_string(&config_file_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(controller) = json
                    .get("experimental")
                    .and_then(|e| e.get("clash_api"))
                    .and_then(|c| c.get("external_controller"))
                    .and_then(|v| v.as_str())
                {
                    if let Some(port_str) = controller.split(':').last() {
                        if let Ok(port) = port_str.parse::<u16>() {
                            debug!("ensure_clash_port: recovered port {} from config", port);
                            *port_lock = Some(port);
                            return Some(port);
                        }
                    }
                } else {
                    debug!("ensure_clash_port: 'experimental.clash_api.external_controller' not found in config.json");
                }
            } else {
                debug!("ensure_clash_port: failed to parse config.json as JSON");
            }
        } else {
            debug!(
                "ensure_clash_port: failed to read config.json at {:?}",
                config_file_path
            );
        }
        None
    }

    async fn wait_for_port(&self, port: u16, timeout_ms: u64) -> bool {
        let addr = format!("127.0.0.1:{}", port);
        debug!(
            "wait_for_port: waiting for {} to be ready (timeout {}ms)",
            addr, timeout_ms
        );
        let start = std::time::Instant::now();
        while start.elapsed().as_millis() < timeout_ms as u128 {
            match tokio::net::TcpStream::connect(&addr).await {
                Ok(_) => {
                    debug!(
                        "wait_for_port: {} is ready after {}ms",
                        addr,
                        start.elapsed().as_millis()
                    );
                    return true;
                }
                Err(_) => {
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
            }
        }
        debug!(
            "wait_for_port: timeout waiting for {} after {}ms",
            addr, timeout_ms
        );
        false
    }

    fn write_config(
        &self,
        node_opt: Option<&crate::profile::Node>,
        mode: crate::config::ConfigMode,
        _routing_mode: &str,
        settings: &crate::settings::AppSettings,
        clash_api_port: Option<u16>,
    ) -> Result<(), String> {
        let tun_mode = mode == crate::config::ConfigMode::TunOnly
            || mode == crate::config::ConfigMode::Combined;
        let app_local_data = self.app.path().app_local_data_dir().unwrap();
        let mut cfg = crate::config::SingBoxConfig::new(clash_api_port, mode);

        // Synchronize log level with app settings
        if let Some(log) = &mut cfg.log {
            let level = settings.log_level.to_lowercase();
            info!("Configuring SingBox log level: {}", level);
            log.level = Some(level);
        }

        // Synchronize DNS strategy with app settings
        if let Some(dns) = &mut cfg.dns {
            let strategy = match settings.dns_strategy.as_str() {
                "ipv4" | "only4" => "ipv4_only".to_string(),
                "ipv6" | "only6" => "ipv6_only".to_string(),
                s => s.to_string(),
            };
            dns.strategy = Some(strategy);
        }

        if tun_mode {
            // CRITICAL FIX: To prevent IPv6 leak, we must enable IPv6 address for TUN
            // even if dns_strategy is "prefer_ipv4". Only disable if explicitly "only4".
            let ipv6_enabled = settings.dns_strategy != "only4";
            cfg = cfg.with_tun_inbound(settings.tun_mtu, settings.tun_stack.clone(), ipv6_enabled);
        }

        let listen = if settings.allow_lan {
            "0.0.0.0"
        } else {
            "127.0.0.1"
        };

        if mode != crate::config::ConfigMode::TunOnly {
            cfg = cfg.with_mixed_inbound(settings.mixed_port, "mixed-in", false);
            if let Some(inbound) = cfg.inbounds.last_mut() {
                inbound.listen = Some(listen.to_string());
                inbound.reuse_addr = Some(true);
            }
        }

        // 1. Add required system outbounds and database paths
        cfg = cfg.with_direct().with_block();

        if let Some(route) = &mut cfg.route {
            let app_local_data = self.app.path().app_local_data_dir().unwrap();
            let resource_dir = self.app.path().resource_dir().unwrap().join("resources");

            // Check order: 1. app_local_data (manual updates), 2. resources (bundled)
            let geoip_path = if app_local_data.join("geoip-cn.srs").exists() {
                Some(app_local_data.join("geoip-cn.srs"))
            } else if resource_dir.join("geoip-cn.srs").exists() {
                Some(resource_dir.join("geoip-cn.srs"))
            } else {
                None
            };

            let geosite_path = if app_local_data.join("geosite-cn.srs").exists() {
                Some(app_local_data.join("geosite-cn.srs"))
            } else if resource_dir.join("geosite-cn.srs").exists() {
                Some(resource_dir.join("geosite-cn.srs"))
            } else {
                None
            };

            route.rule_set = Some(vec![
                if let Some(path) = geoip_path {
                    crate::config::RuleSet {
                        rule_set_type: "local".to_string(),
                        tag: "geoip-cn".to_string(),
                        format: "binary".to_string(),
                        path: Some(path.to_string_lossy().to_string()),
                        url: None,
                        download_detour: None,
                        update_interval: None,
                    }
                } else {
                    crate::config::RuleSet {
                        rule_set_type: "remote".to_string(),
                        tag: "geoip-cn".to_string(),
                        format: "binary".to_string(),
                        path: None,
                        url: Some("https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs".to_string()),
                        download_detour: Some("direct".to_string()),
                        update_interval: Some("1d".to_string()),
                    }
                },
                if let Some(path) = geosite_path {
                    crate::config::RuleSet {
                        rule_set_type: "local".to_string(),
                        tag: "geosite-cn".to_string(),
                        format: "binary".to_string(),
                        path: Some(path.to_string_lossy().to_string()),
                        url: None,
                        download_detour: None,
                        update_interval: None,
                    }
                } else {
                    crate::config::RuleSet {
                        rule_set_type: "remote".to_string(),
                        tag: "geosite-cn".to_string(),
                        format: "binary".to_string(),
                        path: None,
                        url: Some("https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs".to_string()),
                        download_detour: Some("direct".to_string()),
                        update_interval: Some("1d".to_string()),
                    }
                },
            ]);
        }

        // 2. Load Resources (Profiles/Groups)
        let profiles = self.manager.load_profiles().unwrap_or_default();
        let groups = self.get_groups().unwrap_or_default(); // Uses the new dynamic get_groups

        // Track valid outbound tags to prevent "dependency not found" errors
        let mut valid_tags = HashSet::new();
        valid_tags.insert("direct".to_string());
        valid_tags.insert("block".to_string());

        // 3. Add ALL Nodes as Outbounds
        // We iterate all profiles and their nodes
        for profile in &profiles {
            for node in &profile.nodes {
                let tag = node.id.clone(); // Use UUID as tag
                let is_supported = match node.protocol.as_str() {
                    "vmess" | "vless" | "shadowsocks" | "ss" | "trojan" | "hysteria2" | "hy2"
                    | "tuic" => true,
                    _ => false,
                };

                if is_supported {
                    let outbound = self.node_to_outbound(node);
                    cfg.outbounds.push(outbound);
                    valid_tags.insert(tag);
                }
            }
        }

        // 4. Add Group Outbounds
        for group in &groups {
            let mut member_tags = Vec::new();

            match &group.source {
                crate::profile::GroupSource::Static { node_ids } => {
                    // Filter valid nodes
                    for pid in node_ids {
                        if valid_tags.contains(pid) {
                            member_tags.push(pid.clone());
                        } else {
                            debug!(
                                "Skipping invalid node dependency '{}' in group '{}'",
                                pid, group.id
                            );
                        }
                    }
                }
                crate::profile::GroupSource::Filter { criteria } => {
                    // Logic: Iterate all nodes, check match
                    for profile in &profiles {
                        for node in &profile.nodes {
                            let mut matched = true;
                            // 1. Keyword match
                            if let Some(keywords) = &criteria.keywords {
                                let name_lower = node.name.to_lowercase();
                                let any_match = keywords
                                    .iter()
                                    .any(|k| name_lower.contains(&k.to_lowercase()));
                                if !any_match {
                                    matched = false;
                                }
                            }
                            // Future: Sub ID match, etc.

                            if matched {
                                member_tags.push(node.id.clone());
                            }
                        }
                    }
                }
            }

            // If group is empty, we must handle it. Singbox fails with empty selector?
            // Let's add 'block' if empty to prevent crash
            // Prevent crash on empty groups: if no members, fallback to direct
            if member_tags.is_empty() {
                member_tags.push("direct".to_string());
            }

            match group.group_type {
                crate::profile::GroupType::Selector => {
                    // move selected to front
                    let mut tags = member_tags.clone();
                    if let Some(selected) = &group.selected {
                        if let Some(pos) = tags.iter().position(|x| x == selected) {
                            let val = tags.remove(pos);
                            tags.insert(0, val);
                        }
                    }
                    cfg = cfg.with_selector_outbound(&group.id, tags);
                }
                crate::profile::GroupType::UrlTest {
                    interval,
                    tolerance,
                } => {
                    // Default url/interval for now, can be added to Group struct later
                    cfg = cfg.with_urltest_outbound(
                        &group.id,
                        member_tags,
                        None,
                        Some(format!("{}s", interval)),
                        Some(tolerance as u16),
                    );
                }
            }
            valid_tags.insert(group.id.clone());
        }

        // 5. Add MAIN 'proxy' outbound
        // This is what the dashboard "Select Server" controls.
        // For backward compatibility and immediate effect, 'proxy' tag should point to the selected node.
        // We create a Selector `proxy` that contains [selected_node_id].
        // This acts as an alias.

        let mut proxy_target = "direct".to_string(); // Fallback
        if let Some(node) = &node_opt {
            // Verify this node ID exists in our generated outbounds (it should)
            // But 'node_opt' might be a standalone object if not from profile?
            // Usually it's from the list.
            proxy_target = node.id.clone();

            // Check if we already added a vmess/etc outbound for this ID.
            if !valid_tags.contains(&proxy_target) {
                info!("Manual node addition safety net for: {}", node.name);
                // It might be a temp node? Add it manually (legacy behavior fallback)
                let is_supported = match node.protocol.as_str() {
                    "vmess" | "vless" | "shadowsocks" | "ss" | "trojan" | "hysteria2" | "hy2"
                    | "tuic" => true,
                    _ => false,
                };

                if is_supported {
                    // Use the helper to add node with the custom tag pointing to actual node
                    // But here tag is 'proxy_target' which is node.id
                    let mut outbound = self.node_to_outbound(node);
                    outbound.tag = proxy_target.clone();
                    cfg.outbounds.push(outbound);
                    valid_tags.insert(proxy_target.clone());
                } else {
                    proxy_target = "direct".to_string();
                }
            }
        }

        // Define 'proxy' as a Selector wrapping the target, or just direct alias?
        // Singbox doesn't have "Alias".
        // We use a Selector with 1 item.
        // This allows 'proxy' to be used in rules.
        cfg = cfg.with_selector_outbound("proxy", vec![proxy_target]);

        // Apply Rules and Routing Mode
        let mut final_rules = Vec::new();

        // 1. Preserve DNS Rule from initial config
        if let Some(route) = &cfg.route {
            if let Some(dns_rule) = route
                .rules
                .iter()
                .find(|r| r.action == Some("hijack-dns".to_string()))
            {
                final_rules.push(dns_rule.clone());
            }
        }

        // 2. Clear then rebuild rules based on mode
        if let Some(route) = &mut cfg.route {
            route.rules.clear();
        }

        // Insert SNIFF rule at the top for TUN mode
        if tun_mode {
            final_rules.insert(
                0,
                crate::config::RouteRule {
                    inbound: Some(vec!["tun-in".to_string()]),
                    protocol: None,
                    domain: None,
                    domain_suffix: None,
                    domain_keyword: None,
                    ip_cidr: None,
                    port: None,
                    outbound: None,
                    rule_set: None,
                    action: Some("sniff".to_string()),
                },
            );
        }

        // (Removed early IPv6 reject rule to allow user rules and global proxy to take precedence)

        let mut default_policy = "proxy".to_string(); // Default fallback

        match _routing_mode {
            "global" => {
                default_policy = "proxy".to_string();
                // In Global mode, also make DNS go through proxy for safety
                if let Some(dns) = &mut cfg.dns {
                    for server in &mut dns.servers {
                        if server.tag == "google" {
                            server.detour = Some("proxy".to_string());
                        }
                    }
                }
            }
            "direct" => {
                default_policy = "direct".to_string();
                // In Direct mode, also make DNS direct
                if let Some(dns) = &mut cfg.dns {
                    for server in &mut dns.servers {
                        if server.tag == "google" {
                            server.detour = Some("direct".to_string());
                        }
                    }
                }
            }
            _ => {
                // "rule" mode
                if let Ok(user_rules) = self.manager.load_rules() {
                    info!(
                        "Loaded {} user rules for config generation",
                        user_rules.len()
                    );
                    for rule in user_rules {
                        if !rule.enabled {
                            continue;
                        }

                        if rule.rule_type == "FINAL" {
                            let mut policy = match rule.policy.as_str() {
                                "PROXY" => "proxy".to_string(),
                                "DIRECT" => "direct".to_string(),
                                "REJECT" => "reject".to_string(),
                                _ => rule.policy.clone(), // Likely a Group ID
                            };
                            // Validation
                            if policy != "reject" && !valid_tags.contains(&policy) {
                                warn!("Invalid FINAL policy '{}', falling back to 'proxy'", policy);
                                policy = "proxy".to_string();
                            }
                            default_policy = policy;
                            continue;
                        }

                        let (mut outbound_tag, action) = match rule.policy.as_str() {
                            "PROXY" => (Some("proxy".to_string()), None),
                            "DIRECT" => (Some("direct".to_string()), None),
                            "REJECT" => (None, Some("reject".to_string())),
                            _ => (Some(rule.policy.clone()), None), // Assume it's a Group ID or Valid Tag
                        };

                        // Validation
                        if let Some(ref tag) = outbound_tag {
                            if !valid_tags.contains(tag) {
                                warn!(
                                    "Invalid policy '{}' in rule '{}', falling back to 'proxy'",
                                    tag, rule.id
                                );
                                outbound_tag = Some("proxy".to_string());
                            }
                        }

                        let (
                            domain,
                            domain_suffix,
                            domain_keyword,
                            ip_cidr,
                            rule_set_tags,
                            protocol,
                            port,
                        ) = match rule.rule_type.as_str() {
                            "DOMAIN" => {
                                if rule.value.starts_with("geosite:") {
                                    let val = rule.value.replace("geosite:", "");
                                    (None, None, None, None, Some(vec![val]), None, None)
                                } else {
                                    (Some(vec![rule.value]), None, None, None, None, None, None)
                                }
                            }
                            "DOMAIN_SUFFIX" => {
                                (None, Some(vec![rule.value]), None, None, None, None, None)
                            }
                            "DOMAIN_KEYWORD" => {
                                (None, None, Some(vec![rule.value]), None, None, None, None)
                            }
                            "IP_CIDR" => {
                                (None, None, None, Some(vec![rule.value]), None, None, None)
                            }
                            "GEOIP" => {
                                let val = rule.value.replace("geoip:", "");
                                (None, None, None, None, Some(vec![val]), None, None)
                            }
                            _ => (None, None, None, None, None, None, None),
                        };

                        final_rules.push(crate::config::RouteRule {
                            inbound: None,
                            protocol,
                            domain,
                            domain_suffix,
                            domain_keyword,
                            ip_cidr,
                            port,
                            outbound: outbound_tag,
                            rule_set: rule_set_tags,
                            action,
                        });
                    }
                }
            }
        }
        // IPv6 Fallback: Only reject IPv6 traffic if the user explicitly chose "Only IPv4".
        // For "Prefer IPv4", we allow it to fall through to the proxy/direct fallback,
        // which now has 'domain_strategy: prefer_ipv4' to handle it gracefully.
        if settings.dns_strategy == "only4" {
            final_rules.push(crate::config::RouteRule {
                inbound: None,
                protocol: None,
                domain: None,
                domain_suffix: None,
                domain_keyword: None,
                ip_cidr: Some(vec!["::/0".to_string()]),
                port: None,
                outbound: None,
                rule_set: None,
                action: Some("reject".to_string()),
            });
        }

        // 3. Add the ultimate fallback rule
        // Validate ultimate default_policy too (just in case no rule set it or it was invalid)
        if default_policy != "reject" && !valid_tags.contains(&default_policy) {
            default_policy = "proxy".to_string();
        }

        let (fallback_outbound, fallback_action) = if default_policy == "reject" {
            (None, Some("reject".to_string()))
        } else {
            (Some(default_policy.to_string()), None)
        };

        final_rules.push(crate::config::RouteRule {
            inbound: None,
            protocol: None,
            domain: None,
            domain_suffix: None,
            domain_keyword: None,
            ip_cidr: None,
            port: None,
            outbound: fallback_outbound,
            rule_set: None,
            action: fallback_action,
        });

        if let Some(route) = &mut cfg.route {
            route.rules = final_rules;
            let rule_count = route.rules.len();
            info!(
                "Config generated: rules={}, mode={}, default_policy={}",
                rule_count, _routing_mode, default_policy
            );
            // Log DNS detour if exists
            if let Some(dns) = &cfg.dns {
                if let Some(google_server) = dns.servers.iter().find(|s| s.tag == "google") {
                    info!("DNS google detour: {:?}", google_server.detour);
                }
            }
        }
        // 6. Set Cache File to avoid writing to src-tauri in dev
        let cache_name = if mode == crate::config::ConfigMode::TunOnly {
            "cache_tun.db"
        } else {
            "cache.db"
        };
        let clash_api_config = if let Some(port) = clash_api_port {
            Some(crate::config::ClashApiConfig {
                external_controller: format!("127.0.0.1:{}", port),
                external_ui: Some(app_local_data.join("ui").to_string_lossy().to_string()),
                secret: None,
            })
        } else {
            cfg.experimental.and_then(|e| e.clash_api) // Preserve clash_api if already set and no new port provided
        };

        cfg.experimental = Some(crate::config::ExperimentalConfig {
            cache_file: Some(crate::config::CacheFileConfig {
                enabled: true,
                path: app_local_data
                    .join(cache_name)
                    .to_string_lossy()
                    .to_string(),
            }),
            clash_api: clash_api_config,
        });

        // 5.5 Set Domain Strategy for all proxy outbounds
        let domain_strategy = match settings.dns_strategy.as_str() {
            "ipv4" | "only4" => Some("prefer_ipv4".to_string()),
            "ipv6" | "only6" => Some("prefer_ipv6".to_string()),
            _ => None,
        };

        if let Some(strategy) = domain_strategy {
            for outbound in &mut cfg.outbounds {
                // Apply ONLY to protocol outbounds. 
                // selector, urltest, direct, block, dns do not support domain_strategy at the outbound level.
                if matches!(
                    outbound.outbound_type.as_str(),
                    "vmess" | "vless" | "shadowsocks" | "trojan" | "hysteria2" | "tuic"
                ) {
                    outbound.domain_strategy = Some(strategy.clone());
                }
            }
        }

        let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        let config_path = app_local_data.join("config.json");
        std::fs::write(&config_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn refresh_geodata(&self) -> Result<(), String> {
        info!("Refreshing GeoData...");
        let app_local_data = self.app.path().app_local_data_dir().unwrap();

        // Ensure directory exists
        if !app_local_data.exists() {
            std::fs::create_dir_all(&app_local_data).map_err(|e| e.to_string())?;
        }

        let user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        // Strategy: 
        // 1. Try with proxy if proxy is running
        // 2. If it fails (or if proxy not running), try direct
        // This handles cases where the proxy is in a zombie state or doesn't have internet access
        
        let mut clients = Vec::new();
        
        // Add proxy client if running
        if self.is_proxy_running() {
            let settings = self.get_app_settings().unwrap_or_default();
            let port = settings.mixed_port;
            if let Ok(proxy) = reqwest::Proxy::all(format!("http://127.0.0.1:{}", port)) {
                if let Ok(client) = reqwest::Client::builder()
                    .user_agent(user_agent)
                    .timeout(std::time::Duration::from_secs(30))
                    .proxy(proxy)
                    .build() {
                    clients.push(("Proxy", client));
                }
            }
        }
        
        // Always include a direct client as fallback
        if let Ok(client) = reqwest::Client::builder()
            .user_agent(user_agent)
            .timeout(std::time::Duration::from_secs(30))
            .build() {
            clients.push(("Direct", client));
        }

        let files = [
            ("geoip-cn.srs", "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs", "https://testingcf.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip-cn.srs"),
            ("geosite-cn.srs", "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs", "https://testingcf.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-cn.srs"),
        ];

        for (filename, url, fallback_url) in files {
            let mut success = false;
            let mut last_error = String::new();

            // Try each available client (Proxy then Direct)
            for (client_name, client) in &clients {
                // Try primary URL then fallback URL with this client
                for target_url in &[url, fallback_url] {
                    info!("Trying to download {} via {} from {}", filename, client_name, target_url);
                    match client.get(*target_url).send().await {
                        Ok(res) if res.status().is_success() => {
                            if let Ok(bytes) = res.bytes().await {
                                let path = app_local_data.join(filename);
                                if std::fs::write(&path, bytes).is_ok() {
                                    info!("Successfully updated {} via {}", filename, client_name);
                                    success = true;
                                    break;
                                }
                            }
                        }
                        Ok(res) => {
                            last_error = format!("HTTP {}", res.status());
                            warn!("{} failed for {} via {}: {}", target_url, filename, client_name, last_error);
                        }
                        Err(e) => {
                            last_error = e.to_string();
                            warn!("{} failed for {} via {}: {}", target_url, filename, client_name, last_error);
                        }
                    }
                }
                if success { break; }
            }

            if !success {
                return Err(format!("Failed to download {}: {}", filename, last_error));
            }
        }

        // Also clear sing-box cache to ensure it reloads properly
        for db in &["cache.db", "cache_tun.db"] {
            let path = app_local_data.join(db);
            if path.exists() {
                let _ = std::fs::remove_file(&path);
            }
            let tmp_path = std::path::Path::new("/tmp").join(db);
            if tmp_path.exists() {
                let _ = std::fs::remove_file(&tmp_path);
            }
        }

        // Restart proxy if it's running to apply changes
        if self.is_proxy_running() {
            let tun_mode = *self.tun_mode.lock().unwrap();
            let node = self.latest_node.lock().unwrap().clone();
            let routing = self.latest_routing_mode.lock().unwrap().clone();
            self.start_proxy(node, tun_mode, routing).await?;
        }

        Ok(())
    }

    fn stage_databases(&self) -> Result<(), String> {
        let app_local_data = self.app.path().app_local_data_dir().unwrap();
        // Stage databases to /tmp to ensure root/helper can read them (macOS TCC bypass)
        for db in &[
            "cache.db",
        ] {
            let src = app_local_data.join(db);
            let dst = std::path::Path::new("/tmp").join(db);
            if src.exists() {
                if let Err(e) = std::fs::copy(&src, &dst) {
                    warn!("Failed to stage {} to /tmp: {}", db, e);
                } else {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let _ =
                            std::fs::set_permissions(&dst, std::fs::Permissions::from_mode(0o644));
                    }
                }
            }
        }
        Ok(())
    }

    pub fn is_proxy_running(&self) -> bool {
        // In Dual-Instance mode, "running" means either local OR helper is active.
        // We check local state first.
        if *self.local_proxy_running.lock().unwrap() {
            return true;
        }

        // Check helper (even if not in tun_mode, just in case of residue)
        let client = crate::helper_client::HelperClient::new();
        if let Ok(running) = client.check_status() {
            if running {
                return true;
            }
        }

        false
    }

    pub fn get_status(&self) -> ProxyStatus {
        let is_running = self.is_proxy_running();

        let current_tun = *self.tun_mode.lock().unwrap();

        let node = self.latest_node.lock().unwrap().clone();
        let mut target_id = None;
        let mut target_name = None;
        let mut target_type = None;

        if let Some(n) = &node {
            target_id = Some(n.id.clone());
            target_name = Some(n.name.clone());
            target_type = Some(if n.protocol == "group" {
                "group".to_string()
            } else {
                "node".to_string()
            });
        }

        ProxyStatus {
            is_running,
            node,
            target_id,
            target_name,
            target_type,
            tun_mode: current_tun,
            routing_mode: self.latest_routing_mode.lock().unwrap().clone(),
            clash_api_port: self.ensure_clash_port(), // Use recovered port
        }
    }

    /// Helper to restart the proxy with the current in-memory state.
    /// Used by rule updates and other partial config changes.
    async fn restart_proxy_by_config(&self, tun_mode: bool) -> Result<(), String> {
        info!("Applying config changes via full restart...");
        let node = self.latest_node.lock().unwrap().clone();
        let routing_mode = self.latest_routing_mode.lock().unwrap().clone();

        // Re-entrant call to start_proxy will perform clean STOP -> START
        // Note: For Dual-Instance, we pass tun_mode from current settings
        return Box::pin(self.start_proxy(node, tun_mode, routing_mode)).await;
    }

    pub async fn stop_proxy(&self, broadcast: bool) {
        let _lock = self.start_lock.lock().await;
        self.stop_proxy_internal(broadcast, false).await;
    }

    /// Synchronous cleanup for application exit (Cmd+Q)
    /// Skips locks and async waits to ensure execution before process termination.
    pub fn emergency_cleanup(&self) {
        info!("Emergency cleanup triggered...");

        // 1. Stop local libbox core
        if *self.local_proxy_running.lock().unwrap() {
            info!("Stopping local libbox proxy core (emergency)...");
            unsafe {
                let err_ptr = libbox::LibboxStop();
                if !err_ptr.is_null() {
                    let err_msg = CStr::from_ptr(err_ptr).to_string_lossy().into_owned();
                    error!("Emergency LibboxStop failed: {}", err_msg);
                }
            }
            *self.local_proxy_running.lock().unwrap() = false;
        }

        self.log_running
            .store(false, std::sync::atomic::Ordering::SeqCst);
        *self.local_log_fd.lock().unwrap() = None;

        // 2. Stop Helper managed process (if any)
        info!("Notifying helper to stop proxy...");
        crate::helper_client::HelperClient::new().stop_proxy().ok();

        // 3. Disable System Proxy
        // We call disable_system_proxy which uses synchronous Command
        self.disable_system_proxy();

        info!("Emergency cleanup finished.");
    }

    async fn stop_proxy_internal(&self, broadcast: bool, retain_system_proxy: bool) {
        let mut cleanup_performed = false;

        if *self.local_proxy_running.lock().unwrap() {
            cleanup_performed = true;

            info!("Stopping local libbox proxy core...");
            unsafe {
                let err_ptr = libbox::LibboxStop();
                if !err_ptr.is_null() {
                    let err_msg = CStr::from_ptr(err_ptr).to_string_lossy().into_owned();
                    error!("LibboxStop failed: {}", err_msg);
                }
            }
            *self.local_proxy_running.lock().unwrap() = false;
        }

        // 2. Stop Helper Process (TUN)
        info!("Notifying helper to stop proxy...");
        let client = crate::helper_client::HelperClient::new();
        if let Ok(_) = client.stop_proxy() {
            cleanup_performed = true;
            info!("Helper proxy stop command sent.");
        }

        // 4. Robust Port Release Check (Loop up to 3 seconds)
        // Optimization: usage of kill_port_owner loop is a fallback.
        // If we already performed cleanup (killed child), we trust it died.
        // We only enter this fallback loop if we DIDN'T control the process (cleanup_performed = false).
        // This fixes the 5s timeout issue where kill_port_owner might be returning false positives (e.g. via helper).

        if self.manager.load_settings().is_ok() {
            // Deprecated: We rely on helper/child logic.
            // Port checks removed to avoid lsof dependency.
        }

        if cleanup_performed {
            // Minimal safety delay after cleanup
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        }

        // 5. Cleanup system proxy
        if !retain_system_proxy {
            self.disable_system_proxy();
        }

        *self.clash_api_port.lock().unwrap() = None;
        self.log_running
            .store(false, std::sync::atomic::Ordering::SeqCst);
        *self.local_log_fd.lock().unwrap() = None;
        if broadcast {
            let _ = self.app.emit("proxy-status-change", self.get_status());
        }
    }

    pub fn disable_system_proxy(&self) {
        #[cfg(target_os = "macos")]
        {
            info!("Disabling system proxy (local)...");
            // Optimization: Use cached services if available
            let mut services_to_disable = self.active_network_services.lock().unwrap().clone();

            // If cache is empty, we must fallback to scanning all (safety for first run / crash recovery)
            if services_to_disable.is_empty() {
                if let Ok(output) = std::process::Command::new("/usr/sbin/networksetup")
                    .arg("-listallnetworkservices")
                    .output()
                {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for service in stdout.lines() {
                        if service.contains('*') || service.is_empty() {
                            continue;
                        }
                        services_to_disable.push(service.trim().to_string());
                    }
                }
            }

            for s in services_to_disable {
                debug!("Disabling proxy for service: {}", s);
                let _ = std::process::Command::new("/usr/sbin/networksetup")
                    .args(["-setwebproxystate", &s, "off"])
                    .output();
                let _ = std::process::Command::new("/usr/sbin/networksetup")
                    .args(["-setsecurewebproxystate", &s, "off"])
                    .output();
                let _ = std::process::Command::new("/usr/sbin/networksetup")
                    .args(["-setsocksfirewallproxystate", &s, "off"])
                    .output();
            }

            self.active_network_services.lock().unwrap().clear();
        }

        #[cfg(target_os = "windows")]
        {
            info!("Disabling system proxy on Windows...");
            let _ = std::process::Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                    "/v",
                    "ProxyEnable",
                    "/t",
                    "REG_DWORD",
                    "/d",
                    "0",
                    "/f",
                ])
                .output();
        }
        info!("disable_system_proxy finished");
    }

    fn enable_system_proxy(&self, port: u16) {
        #[cfg(target_os = "macos")]
        {
            info!("Enabling system proxy on port {} (local)...", port);
            self.active_network_services.lock().unwrap().clear();

            if let Ok(output) = std::process::Command::new("/usr/sbin/networksetup")
                .arg("-listallnetworkservices")
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for service in stdout.lines() {
                    if service.contains('*') || service.is_empty() {
                        continue;
                    }
                    let s = service.trim();
                    debug!("Enabling proxy for service: {}", s);

                    let mut success = true;
                    // HTTP
                    if let Ok(o) = std::process::Command::new("/usr/sbin/networksetup")
                        .args(["-setwebproxy", s, "127.0.0.1", &port.to_string()])
                        .output()
                    {
                        if !o.status.success() {
                            error!("Failed to set web proxy for {}: {:?}", s, o.stderr);
                            success = false;
                        }
                    }
                    let _ = std::process::Command::new("/usr/sbin/networksetup")
                        .args(["-setwebproxystate", s, "on"])
                        .output();

                    // HTTPS
                    if let Ok(o) = std::process::Command::new("/usr/sbin/networksetup")
                        .args(["-setsecurewebproxy", s, "127.0.0.1", &port.to_string()])
                        .output()
                    {
                        if !o.status.success() {
                            error!("Failed to set secure web proxy for {}: {:?}", s, o.stderr);
                            success = false;
                        }
                    }
                    let _ = std::process::Command::new("/usr/sbin/networksetup")
                        .args(["-setsecurewebproxystate", s, "on"])
                        .output();

                    // SOCKS
                    if let Ok(o) = std::process::Command::new("/usr/sbin/networksetup")
                        .args(["-setsocksfirewallproxy", s, "127.0.0.1", &port.to_string()])
                        .output()
                    {
                        if !o.status.success() {
                            error!("Failed to set SOCKS proxy for {}: {:?}", s, o.stderr);
                        }
                    }
                    let _ = std::process::Command::new("/usr/sbin/networksetup")
                        .args(["-setsocksfirewallproxystate", s, "on"])
                        .output();

                    if success {
                        info!("Successfully enabled system proxy for {}", s);
                        self.active_network_services
                            .lock()
                            .unwrap()
                            .push(s.to_string());
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            info!("Enabling system proxy on Windows port {}...", port);
            let proxy_server = format!("127.0.0.1:{}", port);
            let _ = std::process::Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                    "/v",
                    "ProxyEnable",
                    "/t",
                    "REG_DWORD",
                    "/d",
                    "1",
                    "/f",
                ])
                .output();
            let _ = std::process::Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                    "/v",
                    "ProxyServer",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &proxy_server,
                    "/f",
                ])
                .output();
        }
        info!("enable_system_proxy finished");
    }

    pub fn warmup_network_cache(&self) {
        if !self.active_network_services.lock().unwrap().is_empty() {
            return; // Already populated
        }

        // Spawn background thread to avoid blocking startup
        let services_lock = self.active_network_services.clone();
        std::thread::spawn(move || {
            if let Ok(output) = std::process::Command::new("/usr/sbin/networksetup")
                .arg("-listallnetworkservices")
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut lock = services_lock.lock().unwrap();
                // Check again in case populated while waiting
                if !lock.is_empty() {
                    return;
                }

                for service in stdout.lines() {
                    if service.contains('*') || service.is_empty() {
                        continue;
                    }
                    lock.push(service.trim().to_string());
                }
            }
        });
    }

    pub async fn import_subscription(
        &self,
        url: &str,
        name: Option<String>,
    ) -> Result<String, String> {
        let new_profile = self.manager.fetch_subscription(url, name).await?;

        if new_profile.nodes.is_empty() {
            return Err("No valid nodes found in this subscription".to_string());
        }

        let mut profiles = self.manager.load_profiles()?;
        let id_clone = new_profile.id.clone();

        // Remove existing profile with same URL or ID if logic requires,
        // but for now we just append. Maybe check for duplicate URL?
        // Let's allow duplicates for now to be safe, user can delete.
        // Trigger location probe for new nodes
        let node_ids: Vec<String> = new_profile.nodes.iter().map(|n| n.id.clone()).collect();
        profiles.push(new_profile);
        info!("Imported subscription. Total profiles: {}", profiles.len());
        self.manager.save_profiles(&profiles)?;

        let handle = self.app.clone();
        tokio::spawn(async move {
            if let Some(service) = handle.try_state::<ProxyService<R>>() {
                let ids_latency = node_ids.clone();
                // Trigger both location and latency probes
                let _ = service.probe_nodes_location(node_ids).await;
                let _ = service.probe_nodes_latency(ids_latency).await;
            }
        });

        Ok(id_clone)
    }

    pub fn get_profiles(&self) -> Result<Vec<crate::profile::Profile>, String> {
        self.manager.load_profiles()
    }

    pub fn delete_profile(&self, profile_id: &str) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles()?;
        profiles.retain(|p| p.id != profile_id);
        self.manager.save_profiles(&profiles)
    }

    // Refetch/Update a profile
    // Edit profile metadata (rename, url, interval)
    pub fn edit_profile(
        &self,
        id: &str,
        name: &str,
        url: Option<String>,
        update_interval: Option<u64>,
        clear_interval: bool,
    ) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles()?;
        if let Some(profile) = profiles.iter_mut().find(|p| p.id == id) {
            profile.name = name.to_string();
            // Only update URL if provided (allow clearing? No, usually empty string or None)
            // If the user wants to clear it, they pass empty string?
            // Let's assume Option<String> means "update if Some".
            // But how to clear? Maybe empty string.
            if let Some(u) = url {
                let u = u.trim();
                if u.is_empty() {
                    profile.url = None;
                } else {
                    profile.url = Some(u.to_string());
                }
            }
            
            if clear_interval {
                profile.update_interval = None;
            } else if update_interval.is_some() {
                profile.update_interval = update_interval;
            }

            self.manager.save_profiles(&profiles)?;
            Ok(())
        } else {
            Err(format!("Profile {} not found", id))
        }
    }

    pub async fn update_subscription_profile(&self, profile_id: &str) -> Result<Vec<String>, String> {
        let mut profiles = self.manager.load_profiles().unwrap_or_default();
        if let Some(pos) = profiles.iter().position(|p| p.id == profile_id) {
            if let Some(url) = &profiles[pos].url {
                // Keep name and user preference for update interval
                let name = profiles[pos].name.clone();
                let user_interval = profiles[pos].update_interval;

                let updated_profile = self.manager.fetch_subscription(url, Some(name)).await?;

                if updated_profile.nodes.is_empty() {
                    return Err("No valid nodes found in this subscription".to_string());
                }

                // Preserve ID to keep selection valid if possible, but fetch generates new ID.
                // Let's reuse the old ID.
                let mut p = updated_profile;
                p.id = profiles[pos].id.clone();
                p.update_interval = user_interval; // Restore user preference
                // p.header_update_interval is already set by fetch_subscription

                let node_ids: Vec<String> = p.nodes.iter().map(|n| n.id.clone()).collect();
                let return_ids = node_ids.clone(); // Clone for return
                
                profiles[pos] = p;
                self.manager.save_profiles(&profiles)?;

                let handle = self.app.clone();
                tokio::spawn(async move {
                    if let Some(service) = handle.try_state::<ProxyService<R>>() {
                        let ids_latency = node_ids.clone();
                        let _ = service.probe_nodes_location(node_ids).await;
                        let _ = service.probe_nodes_latency(ids_latency).await;
                    }
                });

                return Ok(return_ids);
            }
        }
        Err("Profile not found or has no URL".to_string())
    }

    pub fn get_nodes(&self) -> Result<Vec<crate::profile::Node>, String> {
        let profiles = self.manager.load_profiles()?;
        let mut all_nodes = vec![];
        for p in profiles {
            all_nodes.extend(p.nodes);
        }
        Ok(all_nodes)
    }

    pub async fn save_rules(&self, rules: Vec<crate::profile::Rule>) -> Result<(), String> {
        self.manager.save_rules(&rules)?;
        if self.is_proxy_running() {
            let tun = *self.tun_mode.lock().unwrap();
            self.restart_proxy_by_config(tun).await
        } else {
            Ok(())
        }
    }

    pub async fn add_rule(&self, rule: crate::profile::Rule) -> Result<(), String> {
        let mut rules = self.manager.load_rules()?;
        rules.push(rule);
        self.manager.save_rules(&rules)?;
        if self.is_proxy_running() {
            let tun = *self.tun_mode.lock().unwrap();
            self.restart_proxy_by_config(tun).await
        } else {
            Ok(())
        }
    }

    pub async fn update_rule(&self, rule: crate::profile::Rule) -> Result<(), String> {
        let mut rules = self.manager.load_rules()?;
        if let Some(pos) = rules.iter().position(|r| r.id == rule.id) {
            rules[pos] = rule;
            self.manager.save_rules(&rules)?;
            if self.is_proxy_running() {
                let tun = *self.tun_mode.lock().unwrap();
                self.restart_proxy_by_config(tun).await
            } else {
                Ok(())
            }
        } else {
            Err("Rule not found".to_string())
        }
    }

    pub async fn delete_rule(&self, id: &str) -> Result<(), String> {
        let mut rules = self.manager.load_rules()?;
        rules.retain(|r| r.id != id);
        self.manager.save_rules(&rules)?;
        if self.is_proxy_running() {
            let tun = *self.tun_mode.lock().unwrap();
            self.restart_proxy_by_config(tun).await
        } else {
            Ok(())
        }
    }

    pub fn get_rules(&self) -> Result<Vec<crate::profile::Rule>, String> {
        self.manager.load_rules()
    }

    // Group Management
    pub fn get_groups(&self) -> Result<Vec<crate::profile::Group>, String> {
        let saved_groups = self.manager.load_groups().unwrap_or_default();

        // Helper to find saved state
        let get_saved = |id: &str| -> Option<&crate::profile::Group> {
            saved_groups.iter().find(|g| g.id == id)
        };

        // Filter out system/implicit groups from saved list to avoid duplicates/staleness.
        // We will regenerate them fresh and re-apply the 'selected' state and 'group_type'.
        let mut final_groups: Vec<crate::profile::Group> = saved_groups
            .iter()
            .filter(|g| !g.id.starts_with("system:"))
            .cloned()
            .collect();

        // Add Implicit Groups (Freshly generated)
        let profiles = self.manager.load_profiles().unwrap_or_default();
        let mut all_node_ids = Vec::new();

        // 1. Global Group
        for p in &profiles {
            for n in &p.nodes {
                all_node_ids.push(n.id.clone());
            }
        }

        let mut global_group = crate::profile::Group {
            id: "system:global".to_string(),
            name: "GLOBAL".to_string(),
            // Default to UrlTest for GLOBAL so "Auto Select" works by default
            group_type: crate::profile::GroupType::UrlTest {
                interval: 600,
                tolerance: 50,
            },
            source: crate::profile::GroupSource::Static {
                node_ids: all_node_ids,
            },
            icon: Some("globe".to_string()),
            selected: None,
        };
        // Restore selection only. 
        // We FORCE UrlTest for system:global because selecting this group implies "Auto Mode".
        // Manual selection is done by picking specific nodes, not by setting this group to Selector.
        if let Some(saved) = get_saved(&global_group.id) {
            global_group.selected = saved.selected.clone();
            // Do NOT restore group_type. Always use the definition above (UrlTest).
        }
        // Insert Global at start of list
        final_groups.insert(0, global_group);

        // 2. Subscription Groups (Default to UrlTest/Automatic)
        for p in &profiles {
            let node_ids = p.nodes.iter().map(|n| n.id.clone()).collect();
            let mut sub_group = crate::profile::Group {
                id: format!("system:sub:{}", p.id),
                name: p.name.clone(),
                group_type: crate::profile::GroupType::UrlTest {
                    interval: 600,
                    tolerance: 50,
                },
                source: crate::profile::GroupSource::Static { node_ids },
                icon: Some("layers".to_string()),
                selected: None,
            };

            // Restore selection only
            if let Some(saved) = get_saved(&sub_group.id) {
                sub_group.selected = saved.selected.clone();
                // do not restore group_type, force Automatic
            }
            final_groups.push(sub_group);
        }

        // 3. Region Groups
        let mut region_map: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();
        for p in &profiles {
            for n in &p.nodes {
                let mut country_code = String::new();

                if let Some(loc) = &n.location {
                    if !loc.country.is_empty() {
                        country_code = loc.country.clone();
                    }
                }

                // Fallback: Infer from name if no explicit location code
                if country_code.is_empty() {
                    let name_lower = n.name.to_lowercase();
                    
                    // Helper to check for code (e.g. " us ", "us ", " us")
                    // Simple contains check is risky ("bonus" contains "us"), so we need boundary checks or specific keywords
                    // For simplicity and robustness matching flags.ts:
                    let keywords = [
                        ("hk", "hk"), ("hong kong", "hk"), ("hongkong", "hk"), ("香港", "hk"),
                        ("tw", "tw"), ("taiwan", "tw"), ("台湾", "tw"),
                        ("jp", "jp"), ("japan", "jp"), ("日本", "jp"),
                        ("sg", "sg"), ("singapore", "sg"), ("新加坡", "sg"),
                        ("us", "us"), ("usa", "us"), ("united states", "us"), ("america", "us"), ("美国", "us"),
                        ("kr", "kr"), ("korea", "kr"), ("韩国", "kr"),
                        ("uk", "gb"), ("gb", "gb"), ("united kingdom", "gb"), ("britain", "gb"), ("英国", "gb"),
                        ("de", "de"), ("germany", "de"), ("德国", "de"),
                        ("fr", "fr"), ("france", "fr"), ("法国", "fr"),
                        ("ca", "ca"), ("canada", "ca"), ("加拿大", "ca"),
                        ("ru", "ru"), ("russia", "ru"), ("俄罗斯", "ru"),
                        ("in", "in"), ("india", "in"), ("印度", "in"),
                        ("tr", "tr"), ("turkey", "tr"), ("土耳其", "tr"),
                        ("au", "au"), ("australia", "au"), ("澳大利亚", "au"), ("澳洲", "au"),
                        ("br", "br"), ("brazil", "br"), ("巴西", "br"),
                        ("cn", "cn"), ("china", "cn"), ("中国", "cn"), ("回国", "cn"),
                    ];
                    
                    // 1. Check for whole word matches of short codes
                    for (pattern, code) in keywords.iter() {
                        // For short codes (length 2), ensure boundaries
                        if pattern.len() == 2 {
                             // Check if name_lower contains pattern with boundaries
                             // Valid: "Node US 1", "HK-Server", "[JP] Node"
                             // Invalid: "Bus", "Link"
                             
                             // A simple heuristic: check if the pattern exists and the char before/after is not a-z
                             if let Some(idx) = name_lower.find(pattern) {
                                 let before = if idx == 0 { false } else {
                                     name_lower.chars().nth(idx - 1).map(|c| c.is_alphabetic()).unwrap_or(false)
                                 };
                                 let after = name_lower.chars().nth(idx + pattern.len()).map(|c| c.is_alphabetic()).unwrap_or(false);
                                 
                                 if !before && !after {
                                     country_code = code.to_string();
                                     break;
                                 }
                             }
                        } else {
                            // For longer names (names/chinese), simple filtering is usually safe
                           if name_lower.contains(pattern) {
                               country_code = code.to_string();
                               break;
                           } 
                        }
                    }
                }

                if !country_code.is_empty() {
                    // Normalize to uppercase for consistency with IP-API
                    let country_upper = country_code.to_uppercase();
                    region_map
                        .entry(country_upper)
                        .or_default()
                        .push(n.id.clone());
                }
            }
        }

        for (country, node_ids) in region_map {
            let mut region_group = crate::profile::Group {
                id: format!("system:region:{}", country),
                name: country.clone(),
                group_type: crate::profile::GroupType::UrlTest {
                    interval: 600,
                    tolerance: 50,
                },
                source: crate::profile::GroupSource::Static { node_ids },
                icon: Some("map-pin".to_string()),
                selected: None,
            };

            // Restore selection and group type
            if let Some(saved) = get_saved(&region_group.id) {
                region_group.selected = saved.selected.clone();
                region_group.group_type = saved.group_type.clone();
            }
            final_groups.push(region_group);
        }

        Ok(final_groups)
    }

    pub async fn save_groups(&self, groups: Vec<crate::profile::Group>) -> Result<(), String> {
        self.manager.save_groups(&groups)?;
        if self.is_proxy_running() {
            let tun = *self.tun_mode.lock().unwrap();
            self.restart_proxy_by_config(tun).await
        } else {
            Ok(())
        }
    }

    pub async fn add_group(&self, group: crate::profile::Group) -> Result<(), String> {
        let mut groups = self.manager.load_groups().unwrap_or_default();
        groups.push(group);
        self.manager.save_groups(&groups)?;
        if self.is_proxy_running() {
            let tun = *self.tun_mode.lock().unwrap();
            self.restart_proxy_by_config(tun).await
        } else {
            Ok(())
        }
    }

    pub async fn update_group(&self, group: crate::profile::Group) -> Result<(), String> {
        let mut groups = self.manager.load_groups().unwrap_or_default();
        if let Some(pos) = groups.iter().position(|g| g.id == group.id) {
            groups[pos] = group;
            self.manager.save_groups(&groups)?;
            if self.is_proxy_running() {
                let tun = *self.tun_mode.lock().unwrap();
                self.restart_proxy_by_config(tun).await
            } else {
                Ok(())
            }
        } else if group.id.starts_with("system:") {
            groups.push(group);
            self.manager.save_groups(&groups)?;
            if self.is_proxy_running() {
                let tun = *self.tun_mode.lock().unwrap();
                self.restart_proxy_by_config(tun).await
            } else {
                Ok(())
            }
        } else {
            Err("Group not found".to_string())
        }
    }

    pub async fn delete_group(&self, id: &str) -> Result<(), String> {
        let mut groups = self.manager.load_groups().unwrap_or_default();
        groups.retain(|g| g.id != id);
        self.manager.save_groups(&groups)?;
        if self.is_proxy_running() {
            let tun = *self.tun_mode.lock().unwrap();
            self.restart_proxy_by_config(tun).await
        } else {
            Ok(())
        }
    }

    pub fn get_app_settings(&self) -> Result<crate::settings::AppSettings, String> {
        self.manager.load_settings()
    }

    pub fn ensure_auto_group(
        &self,
        name: String,
        references: Vec<String>,
        group_type: crate::profile::GroupType,
    ) -> Result<String, String> {
        let mut groups = self.manager.load_groups().map_err(|e| e.to_string())?;

        // Format an ID from name (e.g. "Auto - US" -> "auto_us") but use UUID to avoid collision?
        // User wants stable ID for the same "Auto - US" concept.
        // Let's sanitize name to make ID.
        let safe_id = format!(
            "auto_{}",
            name.to_lowercase()
                .chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>()
        );
        let id = if safe_id.is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            safe_id
        };

        // Check if exists
        if let Some(existing) = groups.iter_mut().find(|g| g.id == id) {
            existing.name = name;
            existing.group_type = group_type;
            existing.source = crate::profile::GroupSource::Static {
                node_ids: references,
            };
        } else {
            groups.push(crate::profile::Group {
                id: id.clone(),
                name,
                group_type,
                source: crate::profile::GroupSource::Static {
                    node_ids: references,
                },
                icon: Some("zap".to_string()), // Default icon for auto groups
                selected: None,
            });
        }

        self.manager
            .save_groups(&groups)
            .map_err(|e| e.to_string())?;

        // If proxy is running, we should reload groups to make this effective immediately?
        // start_proxy usually regenerates config.
        // If we are about to call start_proxy, we are fine.

        Ok(id)
    }

    pub async fn save_app_settings(
        &self,
        settings: crate::settings::AppSettings,
    ) -> Result<(), String> {
        // Load old settings to compare
        let old_settings = self.manager.load_settings().unwrap_or_default();

        self.manager.save_settings(&settings)?;

        // Apply log level immediately to Rust
        if old_settings.log_level != settings.log_level {
            self.apply_log_level(&settings.log_level);
        }

        // Handle Launch at Login
        // Handle Launch at Login
        #[cfg(desktop)]
        if settings.launch_at_login != old_settings.launch_at_login {
            use tauri_plugin_autostart::ManagerExt;
            if settings.launch_at_login {
                let _ = self.app.autolaunch().enable();
            } else {
                let _ = self.app.autolaunch().disable();
            }
        }

        // Check if proxy is running (Local OR Helper)
        let is_running = self.is_proxy_running();
        if !is_running {
            // Update runtime mutex to match settings if stopped, ensuring consistent state for get_status
            *self.tun_mode.lock().unwrap() = settings.tun_mode;

            // Just emit update if not running
            let _ = self.app.emit("settings-update", &settings);
            
            // Fix: Propagate the active target ID from settings to the status event
            // This prevents the frontend from reverting to the old stale state held in memory
            let mut status = self.get_status();
            status.target_id = settings.active_target_id.clone();
            let _ = self.app.emit("proxy-status-change", status);
            return Ok(());
        }

        // Check if we need a full restart
        // Check if we need a full restart
        let need_restart = settings.mixed_port != old_settings.mixed_port
            || settings.tun_mode != old_settings.tun_mode
            || settings.tun_stack != old_settings.tun_stack
            || settings.tun_mtu != old_settings.tun_mtu
            || settings.strict_route != old_settings.strict_route
            || settings.allow_lan != old_settings.allow_lan
            || settings.dns_hijack != old_settings.dns_hijack
            || settings.dns_strategy != old_settings.dns_strategy
            || settings.dns_servers != old_settings.dns_servers
            || settings.log_level != old_settings.log_level;

        if need_restart {
            info!("Core configuration changed, restarting proxy...");
            let tun = *self.tun_mode.lock().unwrap();
            self.restart_proxy_by_config(tun).await?;
        } else {
            // If only system_proxy changed (or nothing important changed), handle system proxy toggle
            if settings.system_proxy != old_settings.system_proxy {
                if settings.system_proxy {
                    self.enable_system_proxy(settings.mixed_port);
                } else {
                    self.disable_system_proxy();
                }
            }
        }
        let _ = self.app.emit("settings-update", &settings);
        Ok(())
    }

    pub async fn add_node(&self, node: crate::profile::Node) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles()?;

        // Find or create "Local" profile
        let local_idx = profiles
            .iter()
            .position(|p| p.name == "Local" && p.url.is_none());

        let node_id = node.id.clone();
        if let Some(idx) = local_idx {
            profiles[idx].nodes.push(node);
        } else {
            profiles.push(crate::profile::Profile {
                id: uuid::Uuid::new_v4().to_string(),
                name: "Local".to_string(),
                url: None,
                nodes: vec![node],
                upload: None,
                download: None,
                total: None,
                expire: None,
                web_page_url: None,
                update_interval: None,
                header_update_interval: None,
            });
        }
        self.manager.save_profiles(&profiles)?;

        let handle = self.app.clone();
        tokio::spawn(async move {
            if let Some(service) = handle.try_state::<ProxyService<R>>() {
                let _ = service.probe_nodes_location(vec![node_id]).await;
            }
        });

        Ok(())
    }

    pub async fn update_node(&self, node: crate::profile::Node) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles()?;
        let mut found = false;

        let node_id = node.id.clone();
        for p in &mut profiles {
            if let Some(pos) = p.nodes.iter().position(|n| n.id == node_id) {
                p.nodes[pos] = node;
                found = true;
                break;
            }
        }

        if found {
            self.manager.save_profiles(&profiles)?;

            let handle = self.app.clone();
            tokio::spawn(async move {
                if let Some(service) = handle.try_state::<ProxyService<R>>() {
                    let _ = service.probe_nodes_location(vec![node_id]).await;
                }
            });

            Ok(())
        } else {
            Err("Node not found".to_string())
        }
    }

    pub fn delete_node(&self, id: &str) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles()?;

        for p in &mut profiles {
            p.nodes.retain(|n| n.id != id);
        }

        // Optional: Clean up empty profiles? No, keep them.
        self.manager.save_profiles(&profiles)
    }

    pub fn is_tun_mode(&self) -> bool {
        *self.tun_mode.lock().unwrap()
    }

    pub async fn probe_nodes_latency(&self, node_ids: Vec<String>) -> Result<(), String> {
        let profiles = self.manager.load_profiles()?;
        let mut updates = std::collections::HashMap::new();

        // 1. Prepare target nodes
        let mut target_nodes = Vec::new();
        for p in &profiles {
            for n in &p.nodes {
                if !node_ids.is_empty() && !node_ids.contains(&n.id) {
                    continue;
                }
                
                // Only probe supported protocols
                match n.protocol.as_str() {
                    "vmess" | "vless" | "shadowsocks" | "ss" | "trojan" | "hysteria2" | "hy2" | "tuic" | "anytls" => {
                        target_nodes.push(n.clone());
                    }
                    _ => {
                        debug!("Skipping latency probe for unsupported protocol: {}", n.protocol);
                    }
                }
            }
        }

        if target_nodes.is_empty() {
            return Ok(());
        }

        let settings = self.manager.load_settings()?;
        let log_level = settings.log_level.to_lowercase();

        // Unified Native URLTest Strategy (Hiddify-like)
        // Uses sing-box native `URLTest` group for max performance and consistency.
        // Works in both Running and Stopped states without "double proxy" issues in TUN mode.
        
        debug!("probe_nodes_latency: using Native URLTest Batch strategy");
        let mut outbounds = Vec::new();
        for node in &target_nodes {
            let mut outbound = self.node_to_outbound(node);
            // Tag must match Node ID for result mapping
            outbound.tag = node.id.clone(); 
            outbounds.push(outbound);
        }
            
        if !outbounds.is_empty() {
             // Pass log level to Go
             let wrapper = serde_json::json!({
                 "outbounds": outbounds,
                 "log_level": log_level
             });
             let json_str = wrapper.to_string();

             let outbound_c = std::ffi::CString::new(json_str).unwrap();
             // URL is configured in Go URLTest group now (but we pass it anyway for compatibility if needed)
             let target_c = std::ffi::CString::new("http://cp.cloudflare.com/generate_204").unwrap();
             
             // Run FFI in a blocking thread
             let updates_clone = std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new()));
             let updates_c = updates_clone.clone();
             
             tokio::task::spawn_blocking(move || {
                 let res_ptr = unsafe {
                     crate::libbox::LibboxTestBatch(
                         outbound_c.as_ptr(),
                         target_c.as_ptr(),
                         5000 // 5s timeout
                     )
                 };
                 
                 if !res_ptr.is_null() {
                      let res_str = unsafe {
                         std::ffi::CStr::from_ptr(res_ptr)
                             .to_string_lossy()
                             .into_owned()
                     };
                     
                     if let Ok(results) = serde_json::from_str::<std::collections::HashMap<String, u64>>(&res_str) {
                         let mut u = updates_c.lock().unwrap();
                         for (id, latency) in results {
                             u.insert(id, latency);
                         }
                     }
                 }
             }).await.map_err(|e| e.to_string())?;
             
             let u = updates_clone.lock().unwrap();
             for (id, latency) in u.iter() {
                 updates.insert(id.clone(), *latency);
             }
        }

        // 3. Apply updates
        // Reload profiles to minimize race condition window (overwrite risk)
        let mut profiles = self.manager.load_profiles()?;
        for p in &mut profiles {
            for n in &mut p.nodes {
                if let Some(ping) = updates.get(&n.id) {
                    n.ping = Some(*ping);
                }
            }
        }
        self.manager.save_profiles(&profiles)?;
        let _ = self.app.emit("profiles-update", Some(updates.keys().cloned().collect::<Vec<String>>()));

        Ok(())
    }

    pub async fn probe_nodes_location(&self, node_ids: Vec<String>) -> Result<(), String> {
        let profiles = self.manager.load_profiles()?;
        let settings = self.manager.load_settings()?;
        let log_level = settings.log_level.to_lowercase();

        let mut updates = std::collections::HashMap::new();
        let mut futures = Vec::new();
        // Limit concurrency to prevent resource exhaustion (too many sing-box instances)
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(5));

        for p in &profiles {
            for n in &p.nodes {
                let node_id = n.id.clone();
                if !node_ids.is_empty() && !node_ids.contains(&node_id) {
                    continue;
                }

                let outbound = self.node_to_outbound(n);
                
                // Inject log_level into outbound json
                let mut outbound_val = serde_json::to_value(&outbound).map_err(|e| e.to_string())?;
                if let Some(obj) = outbound_val.as_object_mut() {
                    obj.insert("_log_level".to_string(), serde_json::Value::String(log_level.clone()));
                }
                let outbound_json = serde_json::to_string(&outbound_val).map_err(|e| e.to_string())?;

                let current_latency = n.location.as_ref().map(|l| l.latency).unwrap_or(0);
                let sem = semaphore.clone();

                futures.push(tokio::spawn(async move {
                    // Acquire permit to limit active sing-box instances
                    let _permit = sem.acquire().await.unwrap();

                    let outbound_c = std::ffi::CString::new(outbound_json).unwrap();
                    let target_c = std::ffi::CString::new("http://ip-api.com/json").unwrap();

                    let res_ptr = unsafe {
                        crate::libbox::LibboxFetch(
                            outbound_c.as_ptr(),
                            target_c.as_ptr(),
                            10000, // 10s timeout
                        )
                    };

                    if res_ptr.is_null() {
                        return None;
                    }

                    let res_str = unsafe {
                        std::ffi::CStr::from_ptr(res_ptr)
                            .to_string_lossy()
                            .into_owned()
                    };

                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&res_str) {
                        if val["status"] == "success" {
                            let loc = crate::profile::LocationInfo {
                                ip: val["query"].as_str().unwrap_or_default().to_string(),
                                country: val["countryCode"].as_str().unwrap_or_default().to_string(),
                                city: val["city"].as_str().unwrap_or_default().to_string(),
                                lat: val["lat"].as_f64().unwrap_or_default(),
                                lon: val["lon"].as_f64().unwrap_or_default(),
                                isp: val["isp"].as_str().unwrap_or_default().to_string(),
                                latency: current_latency, // Preserve existing latency
                            };
                            return Some((node_id, loc));
                        }
                    }
                    None
                }));
            }
        }

        let results = futures_util::future::join_all(futures).await;

        for res in results {
            if let Ok(Some((id, loc))) = res {
                updates.insert(id, loc);
            }
        }

        // Reload profiles to minimize race condition
        let mut profiles = self.manager.load_profiles()?;
        for p in &mut profiles {
            for n in &mut p.nodes {
                if let Some(loc) = updates.get(&n.id) {
                    n.location = Some(loc.clone());
                }
            }
        }
        self.manager.save_profiles(&profiles)?;
        let _ = self.app.emit("profiles-update", Some(updates.keys().cloned().collect::<Vec<String>>()));

        Ok(())
    }

    pub async fn url_test(&self, node_id: String) -> Result<u64, String> {
        // Reuse the batch strategy (filtering for just this node)
        // This ensures the same Native URLTest mechanism is used.
        self.probe_nodes_latency(vec![node_id.clone()]).await?;

        // Retrieve the updated latency
        let profiles = self.manager.load_profiles()?;
        for p in profiles {
            for n in p.nodes {
                if n.id == node_id {
                    let ping = n.ping.unwrap_or(0);
                    return Ok(ping);
                }
            }
        }
        Err("Node not found after test".to_string())
    }

    fn node_to_outbound(&self, node: &crate::profile::Node) -> crate::config::Outbound {
        let mut cfg = crate::config::SingBoxConfig::new(None, crate::config::ConfigMode::Combined);
        let tag = node.id.clone();

        match node.protocol.as_str() {
            "vmess" => {
                let packet_encoding = node.packet_encoding.clone().or(Some("xudp".to_string()));
                cfg = cfg.with_vmess_outbound(
                    &tag,
                    node.server.clone(),
                    node.port,
                    node.uuid.clone().unwrap_or_default(),
                    node.cipher.clone().unwrap_or("auto".to_string()),
                    0,
                    node.network.clone(),
                    node.path.clone(),
                    node.host.clone(),
                    node.tls,
                    node.insecure,
                    packet_encoding,
                );
            }
            "vless" => {
                let packet_encoding = node.packet_encoding.clone().or(Some("xudp".to_string()));
                cfg = cfg.with_vless_outbound(
                    &tag,
                    node.server.clone(),
                    node.port,
                    node.uuid.clone().unwrap_or_default(),
                    node.flow.clone(),
                    node.network.clone(),
                    node.path.clone(),
                    node.host.clone(),
                    node.tls,
                    node.insecure,
                    node.sni.clone(),
                    node.alpn.clone(),
                    packet_encoding,
                    node.fingerprint.clone(),
                    node.public_key.clone(),
                    node.short_id.clone(),
                );
            }
            "shadowsocks" | "ss" => {
                cfg = cfg.with_shadowsocks_outbound(
                    &tag,
                    node.server.clone(),
                    node.port,
                    node.cipher
                        .clone()
                        .unwrap_or("chacha20-ietf-poly1305".to_string()),
                    node.password.clone().unwrap_or_default(),
                );
            }
            "trojan" => {
                cfg = cfg.with_trojan_outbound(
                    &tag,
                    node.server.clone(),
                    node.port,
                    node.password.clone().unwrap_or_default(),
                    node.network.clone(),
                    node.path.clone(),
                    node.host.clone(),
                    node.tls,
                    node.insecure,
                    node.sni.clone(),
                    node.alpn.clone(),
                    node.fingerprint.clone(),
                    node.public_key.clone(),
                    node.short_id.clone(),
                );
            }
            "hysteria2" | "hy2" => {
                let up_mbps = node.up.as_ref().and_then(|s| s.parse().ok());
                let down_mbps = node.down.as_ref().and_then(|s| s.parse().ok());
                cfg = cfg.with_hysteria2_outbound(
                    &tag,
                    node.server.clone(),
                    node.port,
                    node.password.clone().unwrap_or_default(),
                    node.sni.clone(),
                    node.insecure,
                    node.alpn.clone(),
                    up_mbps,
                    down_mbps,
                    node.obfs.clone(),
                    node.obfs_password.clone(),
                    node.fingerprint.clone(),
                );
            }
            "tuic" => {
                cfg = cfg.with_tuic_outbound(
                    &tag,
                    node.server.clone(),
                    node.port,
                    node.uuid.clone().unwrap_or_default(),
                    node.password.clone(),
                    node.sni.clone(),
                    node.insecure,
                    node.alpn.clone(),
                    None,
                    None,
                    None,
                    None,
                    node.fingerprint.clone(),
                );
            }
            "anytls" => {
                cfg = cfg.with_anytls_outbound(
                    &tag,
                    node.server.clone(),
                    node.port,
                    node.password.clone().unwrap_or_default(),
                    node.tls,
                    node.insecure,
                    node.sni.clone(),
                    node.alpn.clone(),
                    node.fingerprint.clone(),
                    node.disable_sni,
                );
            }
            _ => {
                // Direct for others
                cfg = cfg.with_direct_tag(&tag);
            }
        }

        cfg.outbounds.pop().unwrap()
    }

    // --- Tray Helpers ---

    pub async fn set_routing_mode(&self, mode: &str) -> Result<(), String> {
        // Mode: "rule", "global", "direct"

        // 1. Check if we need to restart
        let is_running = self.is_proxy_running();
        if !is_running {
            // If not running, just update internal state for next start?
            // Or should we start it?
            // Tray "Mode" implies running mode.
            // Ideally we just update the "preferred" mode for next launch if stopped.
            // But if running, we restart.
        }

        let mut _settings = self.manager.load_settings()?;
        // Note: Currently routing mode is passed to start_proxy, not saved in settings directly?
        // Let's check start_proxy signature.
        // Logic: start_proxy takes `routing_mode` arg.
        // But we probably want to persist this preference?
        // Usually apps remember the last mode.
        // Let's assume for now we just restart with new mode if running.

        if is_running {
            let node = self.latest_node.lock().unwrap().clone();
            let tun_mode = *self.tun_mode.lock().unwrap();

            // Restart
            self.start_proxy(node, tun_mode, mode.to_string()).await?;
        }

        Ok(())
    }
    pub fn stop_proxy_sync(&self) {
        // 1. Stop Local Libbox
        if *self.local_proxy_running.lock().unwrap() {
            info!("Stopping local libbox proxy core (sync)...");
            unsafe {
                let err_ptr = libbox::LibboxStop();
                if !err_ptr.is_null() {
                    let err_msg = CStr::from_ptr(err_ptr).to_string_lossy().into_owned();
                    error!("Sync LibboxStop failed: {}", err_msg);
                }
            }
            *self.local_proxy_running.lock().unwrap() = false;
        }

        // 2. Stop Helper
        let _ = crate::helper_client::HelperClient::new().stop_proxy();

        // 4. Cleanup System Proxy
        self.disable_system_proxy();
    }
    fn apply_log_level(&self, level_str: &str) {
        let level = match level_str.to_lowercase().as_str() {
            "trace" => log::LevelFilter::Trace,
            "debug" => log::LevelFilter::Debug,
            "warn" => log::LevelFilter::Warn,
            "error" => log::LevelFilter::Error,
            _ => log::LevelFilter::Info,
        };
        log::set_max_level(level);
        info!("Global log level applied: {:?}", level);
    }
}

impl<R: Runtime> Drop for ProxyService<R> {
    fn drop(&mut self) {
        self.stop_proxy_sync();
    }
}
