use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SingBoxConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log: Option<LogConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dns: Option<DnsConfig>,
    pub inbounds: Vec<Inbound>,
    pub outbounds: Vec<Outbound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<Route>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub experimental: Option<ExperimentalConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Inbound {
    #[serde(rename = "type")]
    pub inbound_type: String,
    pub tag: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listen: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listen_port: Option<u16>,
    // Mixed specific
    // Mixed specific
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_system_proxy: Option<bool>,
    // TUN specific
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_route: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strict_route: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_address: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_exclude_address: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interface_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Outbound {
    #[serde(rename = "type")]
    pub outbound_type: String,
    pub tag: String,
    // Common fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>, // shadowsocks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>, // shadowsocks, trojan
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>, // vmess, vless
    #[serde(skip_serializing_if = "Option::is_none")]
    pub security: Option<String>, // vmess
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alter_id: Option<u16>, // vmess
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flow: Option<String>, // vless: xtls-rprx-vision
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<TransportConfig>, // Replaces 'network'
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<OutboundTls>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connect_timeout: Option<String>,
    // Hysteria2 / TUIC fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub up_mbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub down_mbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub obfs: Option<ObfsConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ObfsConfig {
    #[serde(rename = "type")]
    pub obfs_type: String, // salamander
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransportConfig {
    #[serde(rename = "type")]
    pub transport_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OutboundTls {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub insecure: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alpn: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeoIPConfig {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeoSiteConfig {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Route {
    pub rules: Vec<RouteRule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_set: Option<Vec<RuleSet>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub final_outbound: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_detect_interface: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_domain_resolver: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct RouteRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inbound: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_suffix: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_keyword: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip_cidr: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<Vec<u16>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outbound: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_set: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RuleSet {
    #[serde(rename = "type")]
    pub rule_set_type: String,
    pub tag: String,
    pub format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExperimentalConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_file: Option<CacheFileConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CacheFileConfig {
    pub enabled: bool,
    pub path: String,
}

// Add dns struct
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DnsConfig {
    pub servers: Vec<DnsServer>,
    pub rules: Vec<DnsRule>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DnsServer {
    #[serde(rename = "type")]
    pub dns_type: String,
    pub tag: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address_resolver: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address_strategy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address_fallback_delay: Option<u32>,
    pub detour: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DnsRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inbound: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outbound: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_suffix: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_keyword: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip_cidr: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_set: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}

impl SingBoxConfig {
    pub fn new() -> Self {
        // Basic DNS for Tun Mode v1.12+ Format
        let dns = DnsConfig {
            servers: vec![
                DnsServer {
                    dns_type: "udp".to_string(),
                    tag: "google".to_string(),
                    address: None,
                    server: Some("8.8.8.8".to_string()),
                    server_port: Some(53),
                    address_resolver: None,
                    address_strategy: None,
                    address_fallback_delay: None,
                    detour: Some("proxy".to_string()),
                },
                DnsServer {
                    dns_type: "udp".to_string(),
                    tag: "local".to_string(),
                    address: None,
                    server: Some("223.5.5.5".to_string()),
                    server_port: Some(53),
                    address_resolver: None,
                    address_strategy: None,
                    address_fallback_delay: None,
                    detour: Some("direct".to_string()),
                },
            ],
            rules: vec![DnsRule {
                inbound: Some(vec!["tun-in".to_string()]),
                outbound: None,
                domain: None,
                domain_suffix: None,
                domain_keyword: None,
                ip_cidr: None,
                rule_set: None,
                server: Some("google".to_string()),
                action: Some("route".to_string()),
            }],
        };
        Self {
            log: Some(LogConfig {
                level: Some("debug".to_string()),
                output: None,
            }),
            dns: Some(dns),
            inbounds: vec![],
            outbounds: vec![],
            route: Some(Route {
                rules: vec![
                    RouteRule {
                        inbound: Some(vec!["tun-in".to_string()]),
                        protocol: Some(vec!["dns".to_string()]),
                        domain: None,
                        domain_suffix: None,
                        domain_keyword: None,
                        ip_cidr: None,
                        port: Some(vec![53]),
                        outbound: None,
                        rule_set: None,
                        action: Some("hijack-dns".to_string()), // Use action 'hijack-dns'
                    },
                    RouteRule {
                        inbound: None,
                        protocol: None,
                        domain: None,
                        domain_suffix: None,
                        domain_keyword: None,
                        ip_cidr: Some(vec!["0.0.0.0/0".to_string(), "::/0".to_string()]),
                        port: None,
                        outbound: Some("proxy".to_string()),
                        rule_set: None,
                        action: None,
                    },
                ],
                rule_set: None,
                final_outbound: None,
                auto_detect_interface: Some(true),
                default_domain_resolver: Some("local".to_string()),
            }),
            experimental: Some(ExperimentalConfig {
                cache_file: Some(CacheFileConfig {
                    enabled: true,
                    path: "cache.db".to_string(),
                }),
            }),
        }
    }

    pub fn with_mixed_inbound(mut self, port: u16, tag: &str) -> Self {
        self.inbounds.push(Inbound {
            inbound_type: "mixed".to_string(),
            tag: tag.to_string(),
            listen: Some("127.0.0.1".to_string()),
            listen_port: Some(port),
            set_system_proxy: Some(false),
            auto_route: None,
            strict_route: None,
            address: None,
            route_address: None,
            route_exclude_address: None,
            stack: None,
            interface_name: None,
        });
        self
    }

    pub fn with_tun_inbound(mut self) -> Self {
        self.inbounds.push(Inbound {
            inbound_type: "tun".to_string(),
            tag: "tun-in".to_string(),
            listen: None,
            listen_port: None,
            set_system_proxy: None,
            auto_route: Some(true),
            strict_route: Some(true),
            address: Some(vec!["172.19.0.1/30".to_string()]),
            route_address: None,
            route_exclude_address: None,
            stack: Some("gvisor".to_string()),
            interface_name: None,
        });
        self
    }

    pub fn with_direct(self) -> Self {
        // No need to add an outbound for 'direct' if using action: "direct"
        // But we might still need it for detours or manual selection.
        // For compatibility with current implementation that expects a 'direct' tag:
        self.with_direct_tag("direct")
    }

    pub fn with_direct_tag(mut self, tag: &str) -> Self {
        self.outbounds.push(Outbound {
            outbound_type: "direct".to_string(),
            tag: tag.to_string(),
            server: None,
            server_port: None,
            method: None,
            password: None,
            uuid: None,
            security: None,
            alter_id: None,
            transport: None,
            tls: None,
            connect_timeout: Some("5s".to_string()), // Add this to avoid 'empty' error
            flow: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
        });
        self
    }

    pub fn with_block(mut self) -> Self {
        if let Some(ref mut route) = self.route {
            route.rules.insert(
                0,
                RouteRule {
                    inbound: None,
                    protocol: None,
                    domain: None,
                    domain_suffix: None,
                    domain_keyword: None,
                    ip_cidr: None,
                    port: None,
                    outbound: None,
                    rule_set: None,
                    action: Some("reject".to_string()),
                },
            );
        }
        self
    }

    #[allow(dead_code)]
    pub fn with_shadowsocks_outbound(
        mut self,
        tag: &str,
        server: String,
        port: u16,
        method: String,
        password: String,
    ) -> Self {
        self.outbounds.push(Outbound {
            outbound_type: "shadowsocks".to_string(),
            tag: tag.to_string(),
            server: Some(server),
            server_port: Some(port),
            method: Some(method),
            password: Some(password),
            uuid: None,
            security: None,
            alter_id: None,
            transport: None,
            tls: None,
            connect_timeout: None,
            flow: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
        });
        self
    }

    pub fn with_vmess_outbound(
        mut self,
        tag: &str,
        server: String,
        port: u16,
        uuid: String,
        security: String,
        alter_id: u16,
        transport: Option<String>,
        path: Option<String>,
        host: Option<String>,
        tls: bool,
    ) -> Self {
        let mut transport_config = None;
        if let Some(t_type) = transport {
            let mut headers = None;
            if let Some(ref h) = host {
                let mut map = HashMap::new();
                map.insert("Host".to_string(), h.clone());
                headers = Some(map);
            }

            transport_config = Some(TransportConfig {
                transport_type: t_type,
                path,
                headers,
            });
        }

        self.outbounds.push(Outbound {
            outbound_type: "vmess".to_string(),
            tag: tag.to_string(),
            server: Some(server.clone()),
            server_port: Some(port),
            method: None,
            password: None,
            uuid: Some(uuid),
            security: Some(security),
            alter_id: Some(alter_id),
            transport: transport_config,
            tls: if tls {
                let sni = host.or(Some(server));
                Some(OutboundTls {
                    enabled: true,
                    server_name: sni,
                    insecure: Some(true),
                    alpn: None,
                })
            } else {
                None
            },
            connect_timeout: None,
            flow: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
        });
        self
    }

    pub fn with_vless_outbound(
        mut self,
        tag: &str,
        server: String,
        port: u16,
        uuid: String,
        flow: Option<String>,
        transport: Option<String>,
        path: Option<String>,
        host: Option<String>,
        tls: bool,
        insecure: bool,
        sni: Option<String>,
        alpn: Option<Vec<String>>,
    ) -> Self {
        let mut transport_config = None;
        if let Some(t_type) = transport {
            let mut headers = None;
            if let Some(ref h) = host {
                let mut map = HashMap::new();
                map.insert("Host".to_string(), h.clone());
                headers = Some(map);
            }

            transport_config = Some(TransportConfig {
                transport_type: t_type,
                path,
                headers,
            });
        }

        self.outbounds.push(Outbound {
            outbound_type: "vless".to_string(),
            tag: tag.to_string(),
            server: Some(server.clone()),
            server_port: Some(port),
            method: None,
            password: None,
            uuid: Some(uuid),
            security: None,
            flow,
            alter_id: None,
            transport: transport_config,
            tls: if tls {
                Some(OutboundTls {
                    enabled: true,
                    server_name: sni.or(host).or(Some(server)),
                    insecure: Some(insecure),
                    alpn,
                })
            } else {
                None
            },
            connect_timeout: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
        });
        self
    }

    pub fn with_hysteria2_outbound(
        mut self,
        tag: &str,
        server: String,
        port: u16,
        password: String,
        sni: Option<String>,
        insecure: bool,
        alpn: Option<Vec<String>>,
        up: Option<u32>,
        down: Option<u32>,
        obfs: Option<String>,
        obfs_password: Option<String>,
    ) -> Self {
        self.outbounds.push(Outbound {
            outbound_type: "hysteria2".to_string(),
            tag: tag.to_string(),
            server: Some(server.clone()),
            server_port: Some(port),
            method: None,
            password: Some(password),
            uuid: None,
            security: None,
            flow: None,
            alter_id: None,
            transport: None,
            tls: Some(OutboundTls {
                enabled: true,
                server_name: sni.or(Some(server)),
                insecure: Some(insecure),
                alpn,
            }),
            connect_timeout: None,
            up_mbps: up,
            down_mbps: down,
            obfs: if obfs.is_some() && obfs_password.is_some() {
                Some(ObfsConfig {
                    obfs_type: obfs.unwrap(),
                    password: obfs_password.unwrap(),
                })
            } else {
                None
            },
        });
        self
    }

    pub fn with_tuic_outbound(
        mut self,
        tag: &str,
        server: String,
        port: u16,
        uuid: String,
        password: Option<String>,
        sni: Option<String>,
        insecure: bool,
        alpn: Option<Vec<String>>,
        congestion_controller: Option<String>,
        udp_relay_mode: Option<String>,
    ) -> Self {
        self.outbounds.push(Outbound {
            outbound_type: "tuic".to_string(),
            tag: tag.to_string(),
            server: Some(server.clone()),
            server_port: Some(port),
            method: None,
            password,
            uuid: Some(uuid),
            security: None,
            flow: None,
            alter_id: None,
            transport: None,
            tls: Some(OutboundTls {
                enabled: true,
                server_name: sni.or(Some(server)),
                insecure: Some(insecure),
                alpn,
            }),
            connect_timeout: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
            // TUIC specific fields currently mapped to generic or new fields if needed
            // For now minimal TUIC support.
            // congestion_controller & udp_relay_mode are specific.
            // We might need to extend Outbound struct if we strictly need them.
            // But basic connectivity often works with defaults.
        });
        self
    }

    pub fn with_trojan_outbound(
        mut self,
        tag: &str,
        server: String,
        port: u16,
        password: String,
        transport: Option<String>,
        path: Option<String>,
        host: Option<String>,
        sni: Option<String>,
        insecure: bool,
    ) -> Self {
        let mut transport_config = None;
        if let Some(t_type) = transport {
            let mut headers = None;
            if let Some(ref h) = host {
                let mut map = HashMap::new();
                map.insert("Host".to_string(), h.clone());
                headers = Some(map);
            }

            transport_config = Some(TransportConfig {
                transport_type: t_type,
                path,
                headers,
            });
        }

        self.outbounds.push(Outbound {
            outbound_type: "trojan".to_string(),
            tag: tag.to_string(),
            server: Some(server.clone()),
            server_port: Some(port),
            method: None,
            password: Some(password),
            uuid: None,
            security: None,
            flow: None,
            alter_id: None,
            transport: transport_config,
            tls: Some(OutboundTls {
                enabled: true,
                server_name: sni.or(host).or(Some(server)),
                insecure: Some(insecure),
                alpn: None,
            }),
            connect_timeout: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
        });
        self
    }
}
