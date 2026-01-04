use crate::manager::CoreManager;
use log::{debug, error, info, warn};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager, Runtime};

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

pub struct ProxyService<R: Runtime> {
    app: AppHandle<R>,
    manager: CoreManager<R>,
    child_process: Mutex<Option<Child>>,
    tun_mode: Mutex<bool>,
    latest_node: Mutex<Option<crate::profile::Node>>,
    latest_routing_mode: Mutex<String>,
    clash_api_port: Mutex<Option<u16>>,
    start_lock: tokio::sync::Mutex<()>, // Ensure serialized start operations
    internal_client: reqwest::Client,
    active_network_services: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
}

impl<R: Runtime> ProxyService<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        let manager = CoreManager::new(app.clone());
        let internal_client = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .unwrap_or_default();

        Self {
            app: app.clone(),
            child_process: Mutex::new(None),
            tun_mode: Mutex::new(false), // Init as false, restore later if needed
            latest_node: Mutex::new(None),
            latest_routing_mode: Mutex::new("rule".to_string()),
            clash_api_port: Mutex::new(None),
            start_lock: tokio::sync::Mutex::new(()),
            manager,
            internal_client: reqwest::Client::new(),
            active_network_services: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }

    pub fn init(&self) {
        // Ensure helper cleans up too (in case of previous crash/TUN mode residue)
        crate::helper_client::HelperClient::new().stop_proxy().ok();
        self.kill_all_singbox_processes();
        self.warmup_network_cache();
    }

    fn kill_all_singbox_processes(&self) {
        info!("Performing startup cleanup of orphan sing-box processes...");
        let core_path = self.manager.get_core_path();
        let core_canon = std::fs::canonicalize(&core_path).unwrap_or(core_path.clone());
        let core_name = core_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("sing-box");

        let mut sys = System::new();
        sys.refresh_processes();

        for process in sys.processes().values() {
            let exe_matches = process
                .exe()
                .map(|e| std::fs::canonicalize(e).unwrap_or(e.to_path_buf()) == core_canon)
                .unwrap_or(false);
            let name_matches = process.name() == core_name;

            if exe_matches || name_matches {
                info!(
                    "Startup Cleanup: Killing found process (pid: {}, name: {})",
                    process.pid(),
                    process.name()
                );
                process.kill_with(sysinfo::Signal::Kill);
            }
        }
    }

    pub async fn start_proxy(
        &self,
        node_opt: Option<crate::profile::Node>,
        tun_mode: bool,
        // mode: "global" | "rule" | "direct"
        routing_mode: String,
    ) -> Result<(), String> {
        let _lock = self.start_lock.lock().await;

        self.manager.check_and_download().await?;
        self.manager.ensure_databases().await?;

        let core_path = self.manager.get_core_path();
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
        // Always perform a full restart to ensure stability and clean state.
        // SIGHUP is not reliably supported by sing-box for Tun/Route changes.
        if is_running {
            info!("Restarting proxy to apply changes...");
        }

        // Moved stop_proxy_internal call down to allow retention decision

        // Update state
        *self.latest_node.lock().unwrap() = node_opt.clone();
        *self.tun_mode.lock().unwrap() = tun_mode;
        *self.latest_routing_mode.lock().unwrap() = routing_mode.clone();

        // 4. Generate & Write Config
        self.stage_databases()?;

        // Generate Config
        // Note: We need settings for port allocation and system proxy retention checks
        let settings = match self.manager.load_settings() {
            Ok(s) => s,
            Err(e) => {
                error!("Failed to load settings: {}", e);
                crate::settings::AppSettings::default()
            }
        };

        // Decision: Retain System Proxy?
        // We retain if:
        // 1. Proxy was running
        // 2. TUN mode matches previous state (switching modes might need clean slate)
        // 3. Mixed Port matches previous state (technically we can overwrite, but let's be safe)
        // Note: For now, we assume if is_running is true, we can retain.
        // enable_system_proxy will overwrite settings anyway if they changed.
        // The important part is avoiding 'disable'.
        // Retain only if tun_mode hasn't changed severely.
        let prev_tun = *self.tun_mode.lock().unwrap();
        let retain_system_proxy = is_running && (prev_tun == tun_mode);

        if is_running {
            info!(
                "Restarting proxy (retain_system_proxy={})...",
                retain_system_proxy
            );
        }

        // Full restart required (e.g., switched TUN mode or not running)
        self.stop_proxy_internal(false, retain_system_proxy).await;

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

        self.write_config(node_opt, tun_mode, &routing_mode, &settings, clash_port)?;

        let config_file_path = self
            .app
            .path()
            .app_local_data_dir()
            .unwrap()
            .join("config.json");

        // If TUN mode, use Helper
        if tun_mode {
            info!("Starting proxy in TUN mode via Helper...");
            let client = crate::helper_client::HelperClient::new();
            let result = client
                .start_proxy(
                    std::fs::read_to_string(&config_file_path).map_err(|e| e.to_string())?,
                    core_path.to_string_lossy().to_string(),
                    self.app
                        .path()
                        .app_local_data_dir()
                        .unwrap()
                        .to_string_lossy()
                        .to_string(),
                )
                .map_err(|e| e.to_string());
            if result.is_ok() {
                if settings.system_proxy {
                    if !retain_system_proxy {
                        self.enable_system_proxy(settings.mixed_port);
                    } else {
                        info!("System proxy retention active, skipping redundant enable call.");
                    }
                }

                // Wait for services to be ready
                if !self.wait_for_port(settings.mixed_port, 2000).await {
                    return Err(format!(
                        "Proxy port {} is not responding after startup. Check logs for details.",
                        settings.mixed_port
                    ));
                }
                if let Some(p) = clash_port {
                    if !self.wait_for_port(p, 2000).await {
                        return Err(format!(
                            "Clash API port {} is not responding after startup.",
                            p
                        ));
                    }
                }
                let _ = self.app.emit("proxy-status-change", self.get_status());
            }
            return result;
        }

        // Local Process Mode
        let app_local_data = self.app.path().app_local_data_dir().unwrap();

        let mut cmd = Command::new(core_path);
        cmd.arg("run")
            .arg("-c")
            .arg(&config_file_path)
            .arg("-D")
            .arg(&app_local_data);

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        match cmd.spawn() {
            Ok(mut child) => {
                info!("Proxy core spawning, pid: {}", child.id());

                let stdout = child.stdout.take().unwrap();
                let stderr = child.stderr.take().unwrap();
                let app_handle = self.app.clone();
                let app_handle_err = self.app.clone();

                // Capture early stderr for error reporting
                let startup_stderr = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
                let stderr_capture = startup_stderr.clone();

                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(stdout);
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            info!("[Core] {}", l);
                            let _ = app_handle.emit("proxy-log", l);
                        }
                    }
                });

                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            error!("[Core] {}", l);
                            let _ = app_handle_err.emit("proxy-log", l.clone());
                            // Capture first 10 lines
                            let mut cap = stderr_capture.lock().unwrap();
                            if cap.len() < 10 {
                                cap.push(l);
                            }
                        }
                    }
                });

                // Short wait to check for immediate crash (e.g. port bind error)
                std::thread::sleep(std::time::Duration::from_millis(500));

                if let Ok(Some(status)) = child.try_wait() {
                    let logs = startup_stderr.lock().unwrap().join("\n");
                    let msg = format!(
                        "Proxy core exited prematurely with: {}. Logs:\n{}",
                        status, logs
                    );
                    error!("{}", msg);
                    return Err(msg);
                }

                if settings.system_proxy {
                    if !retain_system_proxy {
                        self.enable_system_proxy(settings.mixed_port);
                    } else {
                        info!("System proxy retention active, skipping redundant enable call.");
                    }
                }

                // Wait for services to be ready locally too
                if !self.wait_for_port(settings.mixed_port, 2000).await {
                    return Err(format!(
                        "Proxy port {} is not responding after startup locally.",
                        settings.mixed_port
                    ));
                }
                if let Some(p) = clash_port {
                    if !self.wait_for_port(p, 2000).await {
                        return Err(format!(
                            "Clash API port {} is not responding after startup locally.",
                            p
                        ));
                    }
                }

                info!("Proxy core started successfully");
                *self.child_process.lock().unwrap() = Some(child);
                let _ = self.app.emit("proxy-status-change", self.get_status());
                Ok(())
            }
            Err(e) => {
                error!("Failed to start proxy core: {}", e);
                Err(e.to_string())
            }
        }
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

        let config_file_path = self
            .app
            .path()
            .app_local_data_dir()
            .unwrap()
            .join("config.json");

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
        node_opt: Option<crate::profile::Node>,
        tun_mode: bool,
        _routing_mode: &str,
        settings: &crate::settings::AppSettings,
        clash_api_port: Option<u16>,
    ) -> Result<(), String> {
        let app_local_data = self.app.path().app_local_data_dir().unwrap();
        let mut cfg = crate::config::SingBoxConfig::new(clash_api_port);

        if tun_mode {
            cfg = cfg.with_tun_inbound(settings.tun_mtu);
        }

        let listen = if settings.allow_lan {
            "0.0.0.0"
        } else {
            "127.0.0.1"
        };

        cfg = cfg.with_mixed_inbound(settings.mixed_port, "mixed-in", false);
        if let Some(inbound) = cfg.inbounds.last_mut() {
            inbound.listen = Some(listen.to_string());
        }

        // 1. Add required system outbounds and database paths
        cfg = cfg.with_direct().with_block();

        if let Some(route) = &mut cfg.route {
            let geoip_cn_path = if tun_mode {
                std::path::Path::new("/tmp")
                    .join("geoip-cn.srs")
                    .to_string_lossy()
                    .to_string()
            } else {
                app_local_data
                    .join("geoip-cn.srs")
                    .to_string_lossy()
                    .to_string()
            };
            let geosite_cn_path = if tun_mode {
                std::path::Path::new("/tmp")
                    .join("geosite-cn.srs")
                    .to_string_lossy()
                    .to_string()
            } else {
                app_local_data
                    .join("geosite-cn.srs")
                    .to_string_lossy()
                    .to_string()
            };

            route.rule_set = Some(vec![
                crate::config::RuleSet {
                    rule_set_type: "local".to_string(),
                    tag: "geoip-cn".to_string(),
                    format: "binary".to_string(),
                    path: Some(geoip_cn_path),
                    url: None,
                },
                crate::config::RuleSet {
                    rule_set_type: "local".to_string(),
                    tag: "geosite-cn".to_string(),
                    format: "binary".to_string(),
                    path: Some(geosite_cn_path),
                    url: None,
                },
            ]);
        }

        // 2. Load Resources (Profiles/Groups)
        let profiles = self.manager.load_profiles().unwrap_or_default();
        let mut groups = self.get_groups().unwrap_or_default(); // Uses the new dynamic get_groups

        // 3. Add ALL Nodes as Outbounds
        // We iterate all profiles and their nodes
        for profile in &profiles {
            for node in &profile.nodes {
                let tag = node.id.clone(); // Use UUID as tag

                // Helper closure or inline to add node
                match node.protocol.as_str() {
                    "vmess" => {
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
                            node.sni.clone(),
                            node.insecure,
                        );
                    }
                    "vless" => {
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
                        );
                    }
                    _ => {
                        // Skip unsupported
                        continue;
                    }
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
                        member_tags.push(pid.clone());
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
            // We can just use node.id
            proxy_target = node.id.clone();

            // Ensure the node outbound exists (e.g. if 'Local' import not in profiles list? Add it!)
            // TODO: Make sure 'Local' imports are in profiles list. safe_profiles usually ensures this?
            // If not, we might miss it.
            // As a safety net, if node_opt is not in profiles, we should add it?
            // For now, assume it's in profiles.

            // Check if we already added a vmess/etc outbound for this ID.
            let exists = cfg.outbounds.iter().any(|o| o.tag == proxy_target);
            if !exists {
                // It might be a temp node? Add it manually (legacy behavior fallback)
                match node.protocol.as_str() {
                    "vmess" => {
                        cfg = cfg.with_vmess_outbound(
                            &proxy_target,
                            node.server.clone(),
                            node.port,
                            node.uuid.clone().unwrap_or_default(),
                            node.cipher.clone().unwrap_or("auto".to_string()),
                            0,
                            node.network.clone(),
                            node.path.clone(),
                            node.host.clone(),
                            node.tls,
                        );
                    }
                    _ => {} // Fallback
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
                            default_policy = match rule.policy.as_str() {
                                "PROXY" => "proxy".to_string(),
                                "DIRECT" => "direct".to_string(),
                                "REJECT" => "reject".to_string(),
                                _ => rule.policy.clone(), // Likely a Group ID
                            };
                            continue;
                        }

                        let (outbound_tag, action) = match rule.policy.as_str() {
                            "PROXY" => (Some("proxy".to_string()), None),
                            "DIRECT" => (Some("direct".to_string()), None),
                            "REJECT" => (None, Some("reject".to_string())),
                            _ => (Some(rule.policy.clone()), None), // Assume it's a Group ID or Valid Tag
                        };

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

        // 3. Add the ultimate fallback rule
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

        let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        let config_path = app_local_data.join("config.json");
        std::fs::write(&config_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn stage_databases(&self) -> Result<(), String> {
        let app_local_data = self.app.path().app_local_data_dir().unwrap();
        // Stage databases to /tmp to ensure root/helper can read them (macOS TCC bypass)
        for db in &[
            "geoip.db",
            "geosite.db",
            "geoip-cn.srs",
            "geosite-cn.srs",
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
        // 1. Check local child
        let mut child_guard = self.child_process.lock().unwrap();
        if let Some(child) = child_guard.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    // Process has exited
                    return false;
                }
                Ok(None) => {
                    // Still running
                    return true;
                }
                Err(e) => {
                    error!("Error checking child process status: {}", e);
                    return false;
                }
            }
        }
        drop(child_guard); // Release lock

        // 2. Check helper (if tun)
        let client = crate::helper_client::HelperClient::new();
        if let Ok(running) = client.check_status() {
            if running {
                return true;
            }
        }

        // 3. Check for orphan processes (Support recovery after UI crash)
        let core_path = self.manager.get_core_path();
        let core_canon = std::fs::canonicalize(&core_path).unwrap_or(core_path);

        let mut sys = System::new();
        sys.refresh_processes();
        for process in sys.processes().values() {
            if let Some(exe) = process.exe() {
                let exe_canon = std::fs::canonicalize(exe).unwrap_or(exe.to_path_buf());
                if exe_canon == core_canon {
                    // Critical Fix: Ignore Zombie processes (defunct)
                    if process.status() == sysinfo::ProcessStatus::Zombie {
                        debug!(
                            "is_proxy_running: Found zombie process (pid: {}), ignoring.",
                            process.pid()
                        );
                        continue;
                    }

                    info!(
                        "is_proxy_running: Found orphan process (pid: {}), ignoring as requested.",
                        process.pid()
                    );
                    // Critical Change: User requested to ignore orphan processes for status check.
                    // This prevents false "Connected" state if previous cleanup failed.
                    continue;
                }
            }
        }

        false
    }

    pub fn get_status(&self) -> ProxyStatus {
        let is_running = self.is_proxy_running();

        // Infer TUN mode from reality if memory is empty
        let helper_running = crate::helper_client::HelperClient::new()
            .check_status()
            .unwrap_or(false);
        let current_tun = if is_running {
            helper_running || *self.tun_mode.lock().unwrap()
        } else {
            *self.tun_mode.lock().unwrap()
        };

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
            clash_api_port: *self.clash_api_port.lock().unwrap(),
        }
    }

    /// Helper to restart the proxy with the current in-memory state.
    /// Used by rule updates and other partial config changes.
    async fn restart_proxy_by_config(&self, tun_mode: bool) -> Result<(), String> {
        info!("Applying config changes via full restart...");
        let node = self.latest_node.lock().unwrap().clone();
        let routing_mode = self.latest_routing_mode.lock().unwrap().clone();

        // Re-entrant call to start_proxy will perform clean STOP -> START
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

        // 1. Kill Child Process
        if let Ok(mut lock) = self.child_process.lock() {
            if let Some(mut child) = lock.take() {
                info!("Killing process {}", child.id());
                let _ = child.kill();
                let _ = child.wait(); // Synchronous wait
            }
        }

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
        let child_to_wait = { self.child_process.lock().unwrap().take() };

        if let Some(mut child) = child_to_wait {
            cleanup_performed = true;
            let pid = child.id();
            info!("Stopping local proxy core (pid: {})...", pid);
            let _ = child.kill();
            // Simplify wait logic: Just wait synchronously.
            // It prevents zombies/orphans and is reliable.
            let _ = child.wait();
        }

        // 2. Stop Helper Process
        let client = crate::helper_client::HelperClient::new();
        if let Ok(_) = client.stop_proxy() {
            cleanup_performed = true;
        }

        // 3. Exhaustive Kill by Executable Path AND Name
        // Optimization: If we cleaned up the child process successfully, skip this expensive scan.
        // We assume 'cleanup_performed' means we had a child handle.
        // However, we want to be safe. Let's only skip if we are sure.
        // For now, let's keep it but maybe optimize `start_proxy` to be cleaner.
        // Actually, sys.refresh_all() is very slow (can be 500ms+ on loaded mac).
        // If cleanup_performed is true, we likely got the main process.
        // Let's skip exhaustive scan if cleanup_performed is true AND retain_system_proxy is true (fast restart).
        // If we are strictly stopping (quit), we might want to be thorough.

        let should_scan = !cleanup_performed;

        if should_scan {
            let core_path = self.manager.get_core_path();
            let core_canon = std::fs::canonicalize(&core_path).unwrap_or(core_path.clone());
            let core_name = core_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("sing-box");

            let mut sys = System::new_all();
            sys.refresh_all();

            for process in sys.processes().values() {
                let exe_matches = process
                    .exe()
                    .map(|e| std::fs::canonicalize(e).unwrap_or(e.to_path_buf()) == core_canon)
                    .unwrap_or(false);
                let name_matches = process.name() == core_name;

                if exe_matches || name_matches {
                    info!(
                        "Killing remaining proxy process (pid: {}, name: {})",
                        process.pid(),
                        process.name()
                    );
                    process.kill_with(sysinfo::Signal::Kill);
                    cleanup_performed = true;
                }
            }
        }

        // 4. Robust Port Release Check (Loop up to 3 seconds)
        // Optimization: usage of kill_port_owner loop is a fallback.
        // If we already performed cleanup (killed child), we trust it died.
        // We only enter this fallback loop if we DIDN'T control the process (cleanup_performed = false).
        // This fixes the 5s timeout issue where kill_port_owner might be returning false positives (e.g. via helper).

        if (!cleanup_performed) && self.manager.load_settings().is_ok() {
            if let Ok(settings) = self.manager.load_settings() {
                let port = settings.mixed_port;
                let start = std::time::Instant::now();
                let mut attempt = 0;

                loop {
                    // kill_port_owner returns true if it found and attempted to kill a process
                    let found_and_killed = self.kill_port_owner(port);

                    if !found_and_killed {
                        break;
                    }

                    if start.elapsed().as_secs() >= 5 {
                        warn!("Timeout waiting for port {} to be released after 5s", port);
                        break;
                    }

                    attempt += 1;
                    debug!(
                        "Port {} still in use (attempt {}), waiting...",
                        port, attempt
                    );
                    tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
                }
            }
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
        if broadcast {
            let _ = self.app.emit("proxy-status-change", self.get_status());
        }
    }

    fn kill_port_owner(&self, port: u16) -> bool {
        let mut killed = false;
        // Search for process using this port (TCP/IPv4)
        if let Ok(output) = std::process::Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
        {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid_str in pids.lines() {
                if let Ok(pid) = pid_str.trim().parse::<u32>() {
                    info!("Force killing process {} squatting on port {}", pid, port);
                    let _ = std::process::Command::new("kill")
                        .args(["-9", &pid.to_string()])
                        .output();
                    killed = true;
                }
            }
        }

        // Also try to ask helper to kill (for root processes)
        let client = crate::helper_client::HelperClient::new();
        if let Ok(_) = client.kill_port(port) {
            killed = true;
        }

        killed
    }

    pub fn warmup_network_cache(&self) {
        if !self.active_network_services.lock().unwrap().is_empty() {
            return; // Already populated
        }

        // Spawn background thread to avoid blocking startup
        let services_lock = self.active_network_services.clone();
        std::thread::spawn(move || {
            // info!("Warming up network service cache in background...");
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

    fn disable_system_proxy(&self) {
        // Optimization: Use cached services if available
        let mut services_to_disable = self.active_network_services.lock().unwrap().clone();

        // If cache is empty, we must fallback to scanning all (safety for first run / crash recovery)
        if services_to_disable.is_empty() {
            info!("Disabling system proxy (scanning all)...");
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
        } else {
            info!("Disabling system proxy (targeted via cache)...");
        }

        for s in services_to_disable {
            // Optimization: Blind Disable.
            // Checking "is enabled" takes 3 extra exec calls per service.
            // Just running "off" is faster and harmless (idempotent).

            // Web Proxy
            let _ = std::process::Command::new("/usr/sbin/networksetup")
                .args(["-setwebproxystate", &s, "off"])
                .output();

            // Secure Web Proxy
            let _ = std::process::Command::new("/usr/sbin/networksetup")
                .args(["-setsecurewebproxystate", &s, "off"])
                .output();

            // SOCKS Proxy
            let _ = std::process::Command::new("/usr/sbin/networksetup")
                .args(["-setsocksfirewallproxystate", &s, "off"])
                .output();
        }

        // Clear cache
        self.active_network_services.lock().unwrap().clear();
        info!("disable_system_proxy finished");
    }

    fn enable_system_proxy(&self, port: u16) {
        info!("Enabling system proxy on port {}...", port);
        // Clean cache before refilling
        self.active_network_services.lock().unwrap().clear();

        if let Ok(output) = std::process::Command::new("/usr/sbin/networksetup")
            .arg("-listallnetworkservices")
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for service in stdout.lines() {
                if service.contains('*') {
                    continue;
                }
                let s = service.trim();
                if s.is_empty() {
                    continue;
                }

                let mut success = true;

                // HTTP
                if let Ok(o) = std::process::Command::new("/usr/sbin/networksetup")
                    .args(["-setwebproxy", s, "127.0.0.1", &port.to_string()])
                    .output()
                {
                    if !o.status.success() {
                        success = false;
                        error!(
                            "Failed to set web proxy for {}: {}",
                            s,
                            String::from_utf8_lossy(&o.stderr)
                        );
                    }
                }

                // Enable HTTP
                if success {
                    let _ = std::process::Command::new("/usr/sbin/networksetup")
                        .args(["-setwebproxystate", s, "on"])
                        .output();
                }

                // HTTPS
                if let Ok(o) = std::process::Command::new("/usr/sbin/networksetup")
                    .args(["-setsecurewebproxy", s, "127.0.0.1", &port.to_string()])
                    .output()
                {
                    if !o.status.success() {
                        success = false;
                        error!(
                            "Failed to set secure web proxy for {}: {}",
                            s,
                            String::from_utf8_lossy(&o.stderr)
                        );
                    }
                }

                // Enable HTTPS
                if success {
                    let _ = std::process::Command::new("/usr/sbin/networksetup")
                        .args(["-setsecurewebproxystate", s, "on"])
                        .output();
                }

                // SOCKS
                if let Ok(o) = std::process::Command::new("/usr/sbin/networksetup")
                    .args(["-setsocksfirewallproxy", s, "127.0.0.1", &port.to_string()])
                    .output()
                {
                    if !o.status.success() {
                        success = false;
                        error!(
                            "Failed to set socks proxy for {}: {}",
                            s,
                            String::from_utf8_lossy(&o.stderr)
                        );
                    }
                }

                // Enable SOCKS
                if success {
                    let _ = std::process::Command::new("/usr/sbin/networksetup")
                        .args(["-setsocksfirewallproxystate", s, "on"])
                        .output();
                }

                if success {
                    self.active_network_services
                        .lock()
                        .unwrap()
                        .push(s.to_string());
                }
            }
        } else {
            error!("Failed to list network services");
        }
    }

    pub async fn import_subscription(
        &self,
        url: &str,
        name: Option<String>,
    ) -> Result<String, String> {
        let new_profile = self.manager.fetch_subscription(url, name).await?;
        let mut profiles = self.manager.load_profiles()?;
        let id_clone = new_profile.id.clone();

        // Remove existing profile with same URL or ID if logic requires,
        // but for now we just append. Maybe check for duplicate URL?
        // Let's allow duplicates for now to be safe, user can delete.
        profiles.push(new_profile);
        info!("Imported subscription. Total profiles: {}", profiles.len());
        self.manager.save_profiles(&profiles)?;
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
    pub fn rename_profile(&self, id: &str, new_name: &str) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles()?;
        if let Some(profile) = profiles.iter_mut().find(|p| p.id == id) {
            profile.name = new_name.to_string();
            self.manager.save_profiles(&profiles)?;
            Ok(())
        } else {
            Err(format!("Profile {} not found", id))
        }
    }

    pub async fn update_subscription_profile(&self, profile_id: &str) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles().unwrap_or_default();
        if let Some(pos) = profiles.iter().position(|p| p.id == profile_id) {
            if let Some(url) = &profiles[pos].url {
                // Keep name, but update nodes and stats
                let name = profiles[pos].name.clone();
                let updated_profile = self.manager.fetch_subscription(url, Some(name)).await?;
                // Preserve ID to keep selection valid if possible, but fetch generates new ID.
                // Let's reuse the old ID.
                let mut p = updated_profile;
                p.id = profiles[pos].id.clone();
                profiles[pos] = p;
                self.manager.save_profiles(&profiles)?;
                return Ok(());
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

        // Filter out system/implicit groups from saved list to avoid duplicates/staleness.
        // We will regenerate them fresh and re-apply the 'selected' state.
        let mut final_groups: Vec<crate::profile::Group> = saved_groups
            .into_iter()
            .filter(|g| !g.id.starts_with("system:"))
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
            group_type: crate::profile::GroupType::Selector,
            source: crate::profile::GroupSource::Static {
                node_ids: all_node_ids,
            },
            icon: Some("globe".to_string()),
            selected: None,
        };
        // Restore selection if saved
        if let Some(saved) = self
            .manager
            .load_groups()
            .unwrap_or_default()
            .iter()
            .find(|g| g.id == global_group.id)
        {
            global_group.selected = saved.selected.clone();
        }
        // Insert Global at start of list (index 0 relative to user groups? or absolute?)
        // Usually Global is first.
        final_groups.insert(0, global_group);

        // 2. Subscription Groups
        for p in &profiles {
            let node_ids = p.nodes.iter().map(|n| n.id.clone()).collect();
            let mut sub_group = crate::profile::Group {
                id: format!("system:sub:{}", p.id),
                name: p.name.clone(),
                group_type: crate::profile::GroupType::Selector,
                source: crate::profile::GroupSource::Static { node_ids },
                icon: Some("layers".to_string()),
                selected: None,
            };

            // Restore selection
            if let Some(saved) = self
                .manager
                .load_groups()
                .unwrap_or_default()
                .iter()
                .find(|g| g.id == sub_group.id)
            {
                sub_group.selected = saved.selected.clone();
            }
            final_groups.push(sub_group);
        }

        // 3. Region Groups
        let mut region_map: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();
        for p in &profiles {
            for n in &p.nodes {
                if let Some(loc) = &n.location {
                    if !loc.country.is_empty() {
                        region_map
                            .entry(loc.country.clone())
                            .or_default()
                            .push(n.id.clone());
                    }
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

            // Restore selection
            if let Some(saved) = self
                .manager
                .load_groups()
                .unwrap_or_default()
                .iter()
                .find(|g| g.id == region_group.id)
            {
                region_group.selected = saved.selected.clone();
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

        // Handle Launch at Login
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
            // Just emit update if not running
            let _ = self.app.emit("settings-update", &settings);
            return Ok(());
        }

        // Check if we need a full restart
        let need_restart = settings.mixed_port != old_settings.mixed_port
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

    pub fn add_node(&self, node: crate::profile::Node) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles()?;

        // Find or create "Local" profile
        let local_idx = profiles
            .iter()
            .position(|p| p.name == "Local" && p.url.is_none());

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
            });
        }
        self.manager.save_profiles(&profiles)
    }

    pub fn update_node(&self, node: crate::profile::Node) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles()?;
        let mut found = false;

        for p in &mut profiles {
            if let Some(pos) = p.nodes.iter().position(|n| n.id == node.id) {
                p.nodes[pos] = node.clone();
                found = true;
                break;
            }
        }

        if found {
            self.manager.save_profiles(&profiles)?;
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

    pub async fn probe_nodes_connectivity(&self, node_ids: Vec<String>) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles()?;

        // 2. Prepare probing plan: (Node, port)
        let mut probe_plan = Vec::new();
        for profile in &profiles {
            for node in &profile.nodes {
                if node_ids.contains(&node.id) {
                    // Alloc port
                    match std::net::TcpListener::bind("127.0.0.1:0") {
                        Ok(l) => {
                            if let Ok(addr) = l.local_addr() {
                                probe_plan.push((node.clone(), addr.port()));
                            }
                        }
                        Err(e) => warn!("Failed to bind ephemeral port: {}", e),
                    }
                }
            }
        }

        if probe_plan.is_empty() {
            return Ok(());
        }

        // 3. Gen Config
        let mut cfg = crate::config::SingBoxConfig::new(None);
        // Clear DNS to avoid "outbound detour not found: proxy" since we don't have a "proxy" outbound in probe config
        cfg.dns = None;

        if let Some(route) = &mut cfg.route {
            route.rules.clear();
            route.default_domain_resolver = None;
        }

        // Disable cache file to avoid lock contention
        if let Some(exp) = &mut cfg.experimental {
            if let Some(cache) = &mut exp.cache_file {
                cache.enabled = false;
            }
        }

        for (node, port) in &probe_plan {
            let inbound_tag = format!("in_{}", node.id);
            let outbound_tag = format!("out_{}", node.id);

            cfg = cfg.with_mixed_inbound(*port, &inbound_tag, false);

            match node.protocol.as_str() {
                "vmess" => {
                    cfg = cfg.with_vmess_outbound(
                        &outbound_tag,
                        node.server.clone(),
                        node.port,
                        node.uuid.clone().unwrap_or_default(),
                        node.cipher.clone().unwrap_or("auto".to_string()),
                        0,
                        node.network.clone(),
                        node.path.clone(),
                        node.host.clone(),
                        node.tls,
                    );
                }
                "shadowsocks" | "ss" => {
                    cfg = cfg.with_shadowsocks_outbound(
                        &outbound_tag,
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
                        &outbound_tag,
                        node.server.clone(),
                        node.port,
                        node.password.clone().unwrap_or_default(),
                        node.network.clone(),
                        node.path.clone(),
                        node.host.clone(),
                        node.sni.clone(),
                        node.insecure,
                    );
                }
                "vless" => {
                    cfg = cfg.with_vless_outbound(
                        &outbound_tag,
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
                    );
                }
                "hysteria2" | "hy2" => {
                    let up_mbps = node.up.as_ref().and_then(|s| s.parse().ok());
                    let down_mbps = node.down.as_ref().and_then(|s| s.parse().ok());

                    cfg = cfg.with_hysteria2_outbound(
                        &outbound_tag,
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
                    );
                }
                "tuic" => {
                    cfg = cfg.with_tuic_outbound(
                        &outbound_tag,
                        node.server.clone(),
                        node.port,
                        node.uuid.clone().unwrap_or_default(),
                        node.password.clone(),
                        node.sni.clone(),
                        node.insecure,
                        node.alpn.clone(),
                        None, // congestion_controller
                        None, // udp_relay_mode
                    );
                }
                _ => {
                    // Start of next block - removing the previous fallback
                    warn!("Skipping unsupported protocol for probe: {}", node.protocol);
                    continue;
                }
            }

            if let Some(route) = &mut cfg.route {
                route.rules.push(crate::config::RouteRule {
                    inbound: Some(vec![inbound_tag]),
                    protocol: None,
                    domain: None,
                    domain_suffix: None,
                    domain_keyword: None,
                    ip_cidr: None,
                    port: None,
                    outbound: Some(outbound_tag.to_string()),
                    rule_set: None,
                    action: None,
                });
            }
        }

        let app_local_data = self.app.path().app_local_data_dir().unwrap();
        let config_file_path = app_local_data.join("probe_config.json");
        let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        std::fs::write(&config_file_path, &json).map_err(|e| e.to_string())?;

        let core_path = self.manager.get_core_path();
        let mut cmd = Command::new(core_path);
        cmd.arg("run")
            .arg("-c")
            .arg(&config_file_path)
            .arg("-D")
            .arg(&app_local_data);

        let mut child = cmd.spawn().map_err(|e| e.to_string())?;

        // Wait for startup
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        let mut futures = Vec::new();
        // Client usage: Since we need distinct proxies, we create a new client for each request
        // or reconfigure? reqwest::Client cannot change proxy after build.
        // But we can create many clients.

        for (node, port) in probe_plan {
            let url = "http://ip-api.com/json";
            let proxy_url = format!("http://127.0.0.1:{}", port);

            futures.push(tokio::spawn(async move {
                let proxy = match reqwest::Proxy::all(&proxy_url) {
                    Ok(p) => p,
                    Err(_) => return None,
                };
                let client = match reqwest::Client::builder()
                    .proxy(proxy)
                    .timeout(std::time::Duration::from_secs(10))
                    .build()
                {
                    Ok(c) => c,
                    Err(_) => return None,
                };

                let start_time = std::time::Instant::now();

                match client.get(url).send().await {
                    Ok(res) => {
                        let duration = start_time.elapsed().as_millis() as u64;
                        if let Ok(json) = res.json::<serde_json::Value>().await {
                            let info = crate::profile::LocationInfo {
                                ip: json
                                    .get("query")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                country: json
                                    .get("country")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                city: json
                                    .get("city")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                lat: json.get("lat").and_then(|v| v.as_f64()).unwrap_or(0.0),
                                lon: json.get("lon").and_then(|v| v.as_f64()).unwrap_or(0.0),
                                isp: json
                                    .get("isp")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                latency: duration,
                            };
                            Some((node.id, info))
                        } else {
                            None
                        }
                    }
                    Err(_) => None,
                }
            }));
        }

        let results = futures_util::future::join_all(futures).await;

        let _ = child.kill();

        let mut updates = std::collections::HashMap::new();
        for res in results {
            if let Ok(Some((id, info))) = res {
                updates.insert(id, info);
            }
        }

        for p in &mut profiles {
            for n in &mut p.nodes {
                if let Some(info) = updates.get(&n.id) {
                    n.location = Some(info.clone());
                }
            }
        }
        self.manager.save_profiles(&profiles)?;

        Ok(())
    }

    pub async fn probe_nodes_latency(&self, node_ids: Vec<String>) -> Result<(), String> {
        let mut profiles = self.manager.load_profiles()?;

        // 2. Prepare probing plan: (Node, port)
        let mut probe_plan = Vec::new();
        for profile in &profiles {
            for node in &profile.nodes {
                if node_ids.contains(&node.id) {
                    // Alloc port
                    match std::net::TcpListener::bind("127.0.0.1:0") {
                        Ok(l) => {
                            if let Ok(addr) = l.local_addr() {
                                probe_plan.push((node.clone(), addr.port()));
                            }
                        }
                        Err(e) => warn!("Failed to bind ephemeral port: {}", e),
                    }
                }
            }
        }

        if probe_plan.is_empty() {
            return Ok(());
        }

        // 3. Gen Config
        let mut cfg = crate::config::SingBoxConfig::new(None);
        cfg.dns = None;

        if let Some(route) = &mut cfg.route {
            route.rules.clear();
            route.default_domain_resolver = None;
        }

        // Disable cache file
        if let Some(exp) = &mut cfg.experimental {
            if let Some(cache) = &mut exp.cache_file {
                cache.enabled = false;
            }
        }

        for (node, port) in &probe_plan {
            let inbound_tag = format!("in_{}", node.id);
            let outbound_tag = format!("out_{}", node.id);

            cfg = cfg.with_mixed_inbound(*port, &inbound_tag, false);

            match node.protocol.as_str() {
                "vmess" => {
                    cfg = cfg.with_vmess_outbound(
                        &outbound_tag,
                        node.server.clone(),
                        node.port,
                        node.uuid.clone().unwrap(),
                        node.cipher.clone().unwrap_or("auto".to_string()),
                        0, // alter_id
                        node.network.clone(),
                        node.path.clone(),
                        node.host.clone(),
                        node.tls,
                    );
                }
                "shadowsocks" | "ss" => {
                    cfg = cfg.with_shadowsocks_outbound(
                        &outbound_tag,
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
                        &outbound_tag,
                        node.server.clone(),
                        node.port,
                        node.password.clone().unwrap_or_default(),
                        node.network.clone(),
                        node.path.clone(),
                        node.host.clone(),
                        node.sni.clone(),
                        node.insecure,
                    );
                }
                "vless" => {
                    cfg = cfg.with_vless_outbound(
                        &outbound_tag,
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
                    );
                }
                "hysteria2" | "hy2" => {
                    let up_mbps = node.up.as_ref().and_then(|s| s.parse().ok());
                    let down_mbps = node.down.as_ref().and_then(|s| s.parse().ok());
                    cfg = cfg.with_hysteria2_outbound(
                        &outbound_tag,
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
                    );
                }
                "tuic" => {
                    cfg = cfg.with_tuic_outbound(
                        &outbound_tag,
                        node.server.clone(),
                        node.port,
                        node.uuid.clone().unwrap_or_default(),
                        node.password.clone(),
                        node.sni.clone(),
                        node.insecure,
                        node.alpn.clone(),
                        None,
                        None,
                    );
                }
                _ => {
                    continue;
                }
            }

            if let Some(route) = &mut cfg.route {
                route.rules.push(crate::config::RouteRule {
                    inbound: Some(vec![inbound_tag]),
                    protocol: None,
                    domain: None,
                    domain_suffix: None,
                    domain_keyword: None,
                    ip_cidr: None,
                    port: None,
                    outbound: Some(outbound_tag.to_string()),
                    rule_set: None,
                    action: None,
                });
            }
        }

        let app_local_data = self.app.path().app_local_data_dir().unwrap();
        let config_file_path = app_local_data.join("ping_config.json");
        let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        std::fs::write(&config_file_path, &json).map_err(|e| e.to_string())?;

        let core_path = self.manager.get_core_path();
        let mut cmd = Command::new(core_path);
        cmd.arg("run")
            .arg("-c")
            .arg(&config_file_path)
            .arg("-D")
            .arg(&app_local_data);

        cmd.stdout(Stdio::null()).stderr(Stdio::null());

        let mut child = cmd.spawn().map_err(|e| e.to_string())?;

        // Wait for startup
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;

        let mut futures = Vec::new();

        for (node, port) in probe_plan {
            let url = "http://www.gstatic.com/generate_204";
            let proxy_url = format!("http://127.0.0.1:{}", port);

            futures.push(tokio::spawn(async move {
                let proxy = match reqwest::Proxy::all(&proxy_url) {
                    Ok(p) => p,
                    Err(_) => return None,
                };
                let client = match reqwest::Client::builder()
                    .proxy(proxy)
                    .timeout(std::time::Duration::from_secs(5))
                    .build()
                {
                    Ok(c) => c,
                    Err(_) => return None,
                };

                let start_time = std::time::Instant::now();

                match client.get(url).send().await {
                    Ok(res) => {
                        let duration = start_time.elapsed().as_millis() as u64;
                        // Accept 204 or success (some captive portals return 200)
                        if res.status().is_success() {
                            Some((node.id, duration))
                        } else {
                            None
                        }
                    }
                    Err(_) => None,
                }
            }));
        }

        let results = futures_util::future::join_all(futures).await;

        let _ = child.kill();

        let mut updates = std::collections::HashMap::new();
        for res in results {
            if let Ok(Some((id, latency))) = res {
                updates.insert(id, latency);
            }
        }

        for p in &mut profiles {
            for n in &mut p.nodes {
                if let Some(ping) = updates.get(&n.id) {
                    n.ping = Some(*ping);
                }
            }
        }
        self.manager.save_profiles(&profiles)?;

        Ok(())
    }

    pub async fn url_test(&self, node_id: String) -> Result<u64, String> {
        let profiles = self.manager.load_profiles()?;
        let mut target_node: Option<crate::profile::Node> = None;

        for p in profiles {
            for n in p.nodes {
                if n.id == node_id {
                    target_node = Some(n);
                    break;
                }
            }
            if target_node.is_some() {
                break;
            }
        }

        let node = target_node.ok_or("Node not found")?;

        // 0. Pre-check: Verify Core Binary works
        let core_path = self.manager.get_core_path();
        let version_check = Command::new(&core_path).arg("version").output();
        match version_check {
            Ok(out) => {
                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    return Err(format!(
                        "Sing-box binary check failed ({}). Stderr: {}",
                        core_path.display(),
                        stderr
                    ));
                }
            }
            Err(e) => {
                return Err(format!(
                    "Failed to execute sing-box at {}: {}",
                    core_path.display(),
                    e
                ));
            }
        }

        // Alloc port
        let port = match std::net::TcpListener::bind("127.0.0.1:0") {
            Ok(l) => l.local_addr().map_err(|e| e.to_string())?.port(),
            Err(e) => return Err(format!("Failed to bind port: {}", e)),
        };

        // Gen Config
        let mut cfg = crate::config::SingBoxConfig::new(None);
        cfg.dns = None;
        if let Some(route) = &mut cfg.route {
            route.rules.clear();
            route.default_domain_resolver = None;
        }

        // Disable cache file to avoid lock contention
        if let Some(exp) = &mut cfg.experimental {
            if let Some(cache) = &mut exp.cache_file {
                cache.enabled = false;
            }
        }

        let inbound_tag = "in_temp";
        let outbound_tag = "out_temp";

        cfg = cfg.with_mixed_inbound(port, inbound_tag, false);

        match node.protocol.as_str() {
            "vmess" => {
                cfg = cfg.with_vmess_outbound(
                    outbound_tag,
                    node.server.clone(),
                    node.port,
                    node.uuid.clone().unwrap(),
                    node.cipher.clone().unwrap_or("auto".to_string()),
                    0,
                    node.network.clone(),
                    node.path.clone(),
                    node.host.clone(),
                    node.tls,
                );
            }
            "shadowsocks" | "ss" => {
                cfg = cfg.with_shadowsocks_outbound(
                    outbound_tag,
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
                    &outbound_tag,
                    node.server.clone(),
                    node.port,
                    node.password.clone().unwrap_or_default(),
                    node.network.clone(),
                    node.path.clone(),
                    node.host.clone(),
                    node.sni.clone(),
                    node.insecure,
                );
            }
            "vless" => {
                cfg = cfg.with_vless_outbound(
                    &outbound_tag,
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
                );
            }
            "hysteria2" | "hy2" => {
                let up_mbps = node.up.as_ref().and_then(|s| s.parse().ok());
                let down_mbps = node.down.as_ref().and_then(|s| s.parse().ok());

                cfg = cfg.with_hysteria2_outbound(
                    &outbound_tag,
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
                );
            }
            "tuic" => {
                cfg = cfg.with_tuic_outbound(
                    &outbound_tag,
                    node.server.clone(),
                    node.port,
                    node.uuid.clone().unwrap_or_default(),
                    node.password.clone(),
                    node.sni.clone(),
                    node.insecure,
                    node.alpn.clone(),
                    None,
                    None,
                );
            }
            _ => {
                return Err(format!(
                    "Unsupported protocol for latency test: {}",
                    node.protocol
                ));
            }
        }

        // Add Route Rule
        if let Some(route) = &mut cfg.route {
            route.rules.push(crate::config::RouteRule {
                inbound: Some(vec![inbound_tag.to_string()]),
                outbound: Some(outbound_tag.to_string()),
                ..Default::default()
            });
        }

        // Define app_local_data early
        let app_local_data = self.app.path().app_local_data_dir().unwrap();

        // Set log output to file
        let log_file_path = app_local_data.join(format!("url_test_{}.log", node.id));
        cfg.log = Some(crate::config::LogConfig {
            level: Some("trace".to_string()),
            output: None, // Print to stdout/stderr
        });

        let config_file_path = app_local_data.join(format!("url_test_{}.json", node.id));
        let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        std::fs::write(&config_file_path, &json).map_err(|e| e.to_string())?;

        let core_path = self.manager.get_core_path();
        let mut cmd = Command::new(&core_path);
        cmd.arg("run")
            .arg("-c")
            .arg(&config_file_path)
            .arg("-D")
            .arg(&app_local_data);

        // Pipe stdout and stderr to capture all output
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| e.to_string())?;

        let stderr = child.stderr.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let output_log = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let output_log_clone = output_log.clone();
        let output_log_clone2 = output_log.clone();

        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    if let Ok(mut g) = output_log_clone.lock() {
                        g.push_str(&l);
                        g.push('\n');
                    }
                }
            }
        });

        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    if let Ok(mut g) = output_log_clone2.lock() {
                        g.push_str(&l);
                        g.push('\n');
                    }
                }
            }
        });

        // Wait for startup
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        if let Ok(Some(status)) = child.try_wait() {
            let _log_content = std::fs::read_to_string(&log_file_path).unwrap_or_default();
            let output_content = output_log.lock().unwrap().clone();
            return Err(format!(
                "Test process exited early ({}). Path: {}. Output: {}. Config: {}",
                status,
                core_path.display(),
                output_content,
                config_file_path.display()
            ));
        }

        let url = "http://www.gstatic.com/generate_204";
        let proxy_url = format!("http://127.0.0.1:{}", port);

        let client_builder = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(5));

        let client = match reqwest::Proxy::all(&proxy_url) {
            Ok(p) => client_builder.proxy(p).build(),
            Err(e) => {
                let _ = child.kill();
                return Err(e.to_string());
            }
        }
        .map_err(|e| {
            let _ = child.kill();
            e.to_string()
        })?;

        let start = std::time::Instant::now();

        let mut attempts = 0;
        let mut result = Err("Init".to_string());

        while attempts < 3 {
            // Check if child is still running before request
            if let Ok(Some(status)) = child.try_wait() {
                let output_content = output_log.lock().unwrap().clone();
                result = Err(format!(
                    "Process died mid-test ({}). Output: {}",
                    status, output_content
                ));
                break;
            }

            result = client.get(url).send().await.map_err(|e| e.to_string());
            if result.is_ok()
                || result
                    .as_ref()
                    .err()
                    .map_or(false, |e| !e.contains("refused") && !e.contains("reset"))
            {
                // If we get a response (any response) or a non-connection error, we break
                // But we need a success for ping
                if let Ok(res) = &result {
                    if res.status().is_success() {
                        break;
                    }
                }
                // If not success but connected?
                // For now let's retry connection errors only.
                // If response status is error, we might accept it as "connected"?
                // generate_204 returns 204 success usually.
            }

            if let Err(ref e) = result {
                // If refused, it might be that the process hasn't bound the port yet or just died
                if e.contains("refused") || e.contains("reset") || e.contains("closed") {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    attempts += 1;
                    continue;
                }
            } else if let Ok(ref res) = result {
                if !res.status().is_success() {
                    // Connected but bad status?
                    // Treat as success for timing?
                    // No, let's treat as success.
                    break;
                }
            }
            break;
        }

        let _ = child.kill();

        match result {
            Ok(res) => {
                let _ = child.wait();
                let _ = std::fs::remove_file(&config_file_path);
                let _ = std::fs::remove_file(&log_file_path);

                if res.status().is_success() {
                    Ok(start.elapsed().as_millis() as u64)
                } else {
                    // Check status
                    Ok(start.elapsed().as_millis() as u64)
                }
            }
            Err(e) => {
                let output_content = output_log.lock().unwrap().clone();
                // Persist config file for debug
                Err(format!(
                    "Request failed: {}. Output: {}. Config: {}",
                    e,
                    output_content,
                    config_file_path.display()
                ))
            }
        }
    }
    pub async fn check_core_update(&self) -> Result<Option<String>, String> {
        self.manager.check_core_update().await
    }

    pub async fn update_core(&self) -> Result<(), String> {
        self.manager.update_core().await
    }

    // --- Tray Helpers ---

    pub async fn toggle_system_proxy(&self) -> Result<bool, String> {
        let mut settings = self.manager.load_settings()?;
        settings.system_proxy = !settings.system_proxy;
        self.manager.save_settings(&settings)?;

        let _ = self.app.emit("settings-update", &settings);

        let is_running = self.is_proxy_running();

        // If running, apply changes
        if is_running {
            if settings.system_proxy {
                self.enable_system_proxy(settings.mixed_port);
            } else {
                self.disable_system_proxy();
            }
        }

        Ok(settings.system_proxy)
    }

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
        // 1. Stop Local Process
        {
            let mut child_opt = self.child_process.lock().unwrap();
            if let Some(mut child) = child_opt.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }

        // 2. Stop Helper
        let _ = crate::helper_client::HelperClient::new().stop_proxy();

        // 3. Port Clearance (Quick)
        if let Ok(settings) = self.manager.load_settings() {
            let _ = self.kill_port_owner(settings.mixed_port);
        }

        // 4. Cleanup System Proxy
        self.disable_system_proxy();
    }
}

impl<R: Runtime> Drop for ProxyService<R> {
    fn drop(&mut self) {
        self.stop_proxy_sync();
    }
}
