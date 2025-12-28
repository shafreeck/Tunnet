use crate::manager::CoreManager;
use log::{error, info, warn};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub struct ProxyService<R: Runtime> {
    app: AppHandle<R>,
    manager: CoreManager<R>,
    child_process: Mutex<Option<Child>>,
    tun_mode: Mutex<bool>,
    latest_node: Mutex<Option<crate::profile::Node>>,
    latest_routing_mode: Mutex<String>,
    start_lock: tokio::sync::Mutex<()>, // Ensure serialized start operations
}

impl<R: Runtime> ProxyService<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        let manager = CoreManager::new(app.clone());
        Self {
            app,
            manager,
            child_process: Mutex::new(None),
            tun_mode: Mutex::new(false),
            latest_node: Mutex::new(None),
            latest_routing_mode: Mutex::new("rule".to_string()),
            start_lock: tokio::sync::Mutex::new(()),
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

        // Full restart required (e.g., switched TUN mode or not running)
        self.stop_proxy();
        // Give OS a small grace period to release TUN interface resources
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        // Update state
        *self.latest_node.lock().unwrap() = node_opt.clone();
        *self.tun_mode.lock().unwrap() = tun_mode;
        *self.latest_routing_mode.lock().unwrap() = routing_mode.clone();

        // 4. Generate & Write Config
        self.stage_databases()?;
        self.write_config(node_opt, tun_mode, &routing_mode)?;

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
            return client
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
                            let _ = app_handle.emit("proxy-log", format!("[INFO] {}", l));
                        }
                    }
                });

                std::thread::spawn(move || {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            error!("[Core] {}", l);
                            let _ = app_handle_err.emit("proxy-log", format!("[ERR] {}", l));
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

                info!("Proxy core started successfully");
                *self.child_process.lock().unwrap() = Some(child);
                Ok(())
            }
            Err(e) => {
                error!("Failed to start proxy core: {}", e);
                Err(e.to_string())
            }
        }
    }

    fn write_config(
        &self,
        node_opt: Option<crate::profile::Node>,
        tun_mode: bool,
        _routing_mode: &str,
    ) -> Result<(), String> {
        let app_local_data = self.app.path().app_local_data_dir().unwrap();
        let mut cfg = crate::config::SingBoxConfig::new();

        if tun_mode {
            cfg = cfg.with_tun_inbound();
        } else {
            cfg = cfg.with_mixed_inbound(2080, "mixed-in"); // HTTP+SOCKS
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

        // Apply Node (Outbound)
        if let Some(node) = node_opt {
            if node.protocol == "vmess" {
                cfg = cfg.with_vmess_outbound(
                    "proxy",
                    node.server,
                    node.port,
                    node.uuid.unwrap_or_default(),
                    node.cipher.unwrap_or("auto".to_string()),
                    0,
                    node.network,
                    node.path,
                    node.host,
                    node.tls,
                );
            } else {
                // Unknown protocol or not yet implemented
                // Fallback to direct but KEEP the 'proxy' tag so routing doesn't crash
                cfg = cfg.with_direct_tag("proxy");
            }
        } else {
            // No node selected: ensure 'proxy' tag exists as a 'direct' fallback
            cfg = cfg.with_direct_tag("proxy");
        }

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

        let mut default_policy = "proxy"; // Default fallback

        match _routing_mode {
            "global" => {
                default_policy = "proxy";
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
                default_policy = "direct";
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
                                "PROXY" => "proxy",
                                "DIRECT" => "direct",
                                "REJECT" => "reject",
                                _ => "proxy",
                            };
                            continue;
                        }

                        let (outbound_tag, action) = match rule.policy.as_str() {
                            "PROXY" => (Some("proxy".to_string()), None),
                            "DIRECT" => (Some("direct".to_string()), None),
                            "REJECT" => (None, Some("reject".to_string())),
                            _ => (Some("proxy".to_string()), None),
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
            ip_cidr: Some(vec!["0.0.0.0/0".to_string(), "::/0".to_string()]),
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
        if let Some(child) = self.child_process.lock().unwrap().as_mut() {
            if let Ok(None) = child.try_wait() {
                return true;
            }
        }

        // 2. Check helper (if tun)
        let client = crate::helper_client::HelperClient::new();
        if let Ok(running) = client.check_status() {
            return running;
        }

        false
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

    pub fn stop_proxy(&self) {
        // 1. Stop Local Process
        let mut child_opt = self.child_process.lock().unwrap();
        if let Some(mut child) = child_opt.take() {
            info!("Stopping proxy core...");
            match child.kill() {
                Ok(_) => info!("Proxy core killed"),
                Err(e) => error!("Failed to kill proxy core: {}", e),
            }
            let _ = child.wait(); // prevent zombie
        }

        // 2. Stop Helper Process (Blindly try to stop, in case it was running)
        let client = crate::helper_client::HelperClient::new();
        // We ignore errors here because helper might not be running or installed
        if let Err(e) = client.stop_proxy() {
            // Only log if it's not a connection error (meaning helper is installed but failed)
            // Actually, for now just debug log it.
            info!("Helper stop request result: {:?}", e);
        } else {
            info!("Helper process stopped successfully");
        }
    }

    pub async fn import_subscription(&self, url: &str, name: Option<String>) -> Result<(), String> {
        let new_profile = self.manager.fetch_subscription(url, name).await?;
        let mut profiles = self.manager.load_profiles()?;

        // Remove existing profile with same URL or ID if logic requires,
        // but for now we just append. Maybe check for duplicate URL?
        // Let's allow duplicates for now to be safe, user can delete.
        profiles.push(new_profile);
        self.manager.save_profiles(&profiles)
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
        let tun = *self.tun_mode.lock().unwrap();
        self.restart_proxy_by_config(tun).await
    }

    pub async fn add_rule(&self, rule: crate::profile::Rule) -> Result<(), String> {
        let mut rules = self.manager.load_rules()?;
        rules.push(rule);
        self.manager.save_rules(&rules)?;
        let tun = *self.tun_mode.lock().unwrap();
        self.restart_proxy_by_config(tun).await
    }

    pub async fn update_rule(&self, rule: crate::profile::Rule) -> Result<(), String> {
        let mut rules = self.manager.load_rules()?;
        if let Some(pos) = rules.iter().position(|r| r.id == rule.id) {
            rules[pos] = rule;
            self.manager.save_rules(&rules)?;
            let tun = *self.tun_mode.lock().unwrap();
            self.restart_proxy_by_config(tun).await
        } else {
            Err("Rule not found".to_string())
        }
    }

    pub async fn delete_rule(&self, id: &str) -> Result<(), String> {
        let mut rules = self.manager.load_rules()?;
        rules.retain(|r| r.id != id);
        self.manager.save_rules(&rules)?;
        let tun = *self.tun_mode.lock().unwrap();
        self.restart_proxy_by_config(tun).await
    }

    pub fn get_rules(&self) -> Result<Vec<crate::profile::Rule>, String> {
        self.manager.load_rules()
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
        let mut cfg = crate::config::SingBoxConfig::new();
        if let Some(route) = &mut cfg.route {
            route.rules.clear();
        }

        for (node, port) in &probe_plan {
            let inbound_tag = format!("in_{}", node.id);
            let outbound_tag = format!("out_{}", node.id);

            cfg = cfg.with_mixed_inbound(*port, &inbound_tag);

            if node.protocol == "vmess" {
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
            } else {
                cfg = cfg.with_direct();
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
}

impl<R: Runtime> Drop for ProxyService<R> {
    fn drop(&mut self) {
        self.stop_proxy();
    }
}
