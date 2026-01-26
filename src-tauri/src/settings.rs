use serde::{Deserialize, Serialize};

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    // General
    pub theme: Option<String>,
    pub launch_at_login: bool,
    pub start_minimized: bool,
    pub auto_update: bool,
    #[serde(default)]
    pub auto_connect: bool,
    #[serde(default = "default_true")]
    pub show_sidebar_status: bool,

    // Connection
    pub system_proxy: bool,
    pub allow_lan: bool,
    pub mixed_port: u16,
    pub tun_mode: bool,
    pub tun_stack: String,
    pub tun_mtu: u16,
    pub strict_route: bool,

    // DNS
    pub dns_hijack: bool,
    pub dns_strategy: String,
    pub dns_servers: String,
    pub routing_mode: Option<String>,

    // Advanced
    pub log_level: String,
    pub active_target_id: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Some("system".to_string()),
            launch_at_login: false,
            start_minimized: false,
            auto_update: true,
            auto_connect: false,
            show_sidebar_status: true,
            system_proxy: true,
            allow_lan: false,
            mixed_port: 2080,
            tun_mode: false,
            tun_stack: "gvisor".to_string(),
            tun_mtu: 9000,
            strict_route: true,
            dns_hijack: true,
            dns_strategy: "ipv4".to_string(),
            dns_servers: "8.8.8.8\n1.1.1.1".to_string(),
            routing_mode: Some("rule".to_string()),
            log_level: "info".to_string(),
            active_target_id: None,
        }
    }
}
