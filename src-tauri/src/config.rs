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

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
pub enum ConfigMode {
    TunOnly,
    SystemProxyOnly,
    Combined,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<bool>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tcp_fast_open: Option<bool>,
    // Added based on user feedback to solve TIME_WAIT
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reuse_addr: Option<bool>,
    // TUN specific
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_route: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strict_route: Option<bool>,
    // Added for compatibility with Hiddify / P2P
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint_independent_nat: Option<bool>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtu: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sniff: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sniff_override_destination: Option<bool>,
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
    pub domain_strategy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<TransportConfig>, // Replaces 'network'
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<OutboundTls>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub packet_encoding: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connect_timeout: Option<String>,
    // Hysteria2 / TUIC fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub up_mbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub down_mbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub obfs: Option<ObfsConfig>,
    // TUIC specific
    #[serde(skip_serializing_if = "Option::is_none")]
    pub congestion_controller: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub udp_relay_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zero_rtt_handshake: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heartbeat: Option<String>,
    // Selector / URLTest fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outbounds: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tolerance: Option<u16>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub utls: Option<UtlsConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reality: Option<RealityConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_sni: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UtlsConfig {
    pub enabled: bool,
    pub fingerprint: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RealityConfig {
    pub enabled: bool,
    pub public_key: String,
    pub short_id: String,
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
    pub ip_is_private: Option<bool>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_detour: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_interval: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExperimentalConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_file: Option<CacheFileConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clash_api: Option<ClashApiConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClashApiConfig {
    pub external_controller: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_ui: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secret: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strategy: Option<String>,
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
    pub fn new(clash_api_port: Option<u16>, mode: ConfigMode, dns_servers: &str) -> Self {
        // Parse user DNS servers or use defaults
        let mut servers = Vec::new();
        let user_servers: Vec<&str> = dns_servers
            .lines()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        if user_servers.is_empty() {
            // Default fallback
            servers.push(DnsServer {
                dns_type: "udp".to_string(),
                tag: "google".to_string(),
                address: None,
                server: Some("8.8.8.8".to_string()),
                server_port: Some(53),
                address_resolver: None,
                address_fallback_delay: None,
                detour: Some("proxy".to_string()),
            });
        } else {
            for (i, s) in user_servers.iter().enumerate() {
                servers.push(DnsServer {
                    dns_type: "udp".to_string(),
                    tag: format!("dns-{}", i),
                    address: None,
                    server: Some(s.to_string()),
                    server_port: Some(53),
                    address_resolver: None,
                    address_fallback_delay: None,
                    detour: Some("proxy".to_string()),
                });
            }
        }

        // Add a local fallback DNS server always
        servers.push(DnsServer {
            dns_type: "udp".to_string(),
            tag: "local".to_string(),
            address: None,
            server: Some("223.5.5.5".to_string()),
            server_port: Some(53),

            address_resolver: None,
            address_fallback_delay: None,
            detour: Some("direct".to_string()),
        });

        let dns = DnsConfig {
            servers,
            rules: vec![DnsRule {
                inbound: Some(vec![match mode {
                    ConfigMode::TunOnly => "tun-in".to_string(),
                    _ => "mixed-in".to_string(),
                }]),
                outbound: None,
                domain: None,
                domain_suffix: None,
                domain_keyword: None,
                ip_cidr: None,
                rule_set: None,
                server: Some(if user_servers.is_empty() {
                    "google".to_string()
                } else {
                    "dns-0".to_string()
                }),
                action: Some("route".to_string()),
            }],
            strategy: None,
        };

        let mut experimental = ExperimentalConfig {
            cache_file: Some(CacheFileConfig {
                enabled: true,
                path: "".to_string(),
            }),

            clash_api: None,
        };

        if let Some(port) = clash_api_port {
            experimental.clash_api = Some(ClashApiConfig {
                external_controller: format!("127.0.0.1:{}", port),
                external_ui: None,
                secret: None,
            });
        }

        Self {
            log: Some(LogConfig {
                level: Some("info".to_string()),
                output: None,
                timestamp: Some(false),
            }),
            dns: Some(dns),
            inbounds: vec![],
            outbounds: vec![],
            route: Some(Route {
                rules: match mode {
                    ConfigMode::TunOnly | ConfigMode::Combined => vec![
                        RouteRule {
                            inbound: Some(vec!["tun-in".to_string()]),
                            protocol: Some(vec!["dns".to_string()]),
                            port: Some(vec![53]),
                            action: Some("hijack-dns".to_string()),
                            ..Default::default()
                        },
                        RouteRule {
                            outbound: Some("proxy".to_string()),
                            ..Default::default()
                        },
                    ],
                    _ => vec![RouteRule {
                        outbound: Some("proxy".to_string()),
                        ..Default::default()
                    }],
                },
                rule_set: None,
                final_outbound: None,
                auto_detect_interface: Some(true),
                default_domain_resolver: Some("local".to_string()),
            }),
            experimental: Some(experimental),
        }
    }

    pub fn with_mixed_inbound(mut self, port: u16, tag: &str, set_system_proxy: bool) -> Self {
        self.inbounds.push(Inbound {
            inbound_type: "mixed".to_string(),
            tag: tag.to_string(),
            listen: Some("127.0.0.1".to_string()),
            listen_port: Some(port),
            set_system_proxy: Some(set_system_proxy),
            tcp_fast_open: None,
            reuse_addr: None,
            auto_route: None,
            strict_route: None,
            endpoint_independent_nat: None,
            address: None,
            route_address: None,
            route_exclude_address: None,
            stack: None,
            interface_name: None,
            mtu: None,
            sniff: Some(true),
            sniff_override_destination: Some(true),
        });
        self
    }

    pub fn with_tun_inbound(
        mut self,
        mtu: u16,
        stack: String,
        ipv6_enabled: bool,
        strict_route: bool,
    ) -> Self {
        let addresses = if ipv6_enabled {
            vec!["172.19.0.1/30".to_string(), "fd00::1/126".to_string()]
        } else {
            vec!["172.19.0.1/30".to_string()]
        };

        self.inbounds.push(Inbound {
            inbound_type: "tun".to_string(),
            tag: "tun-in".to_string(),
            listen: None,
            listen_port: None,
            set_system_proxy: None,
            tcp_fast_open: None,
            reuse_addr: None,
            auto_route: Some(true),
            strict_route: Some(strict_route),
            endpoint_independent_nat: None,
            address: Some(addresses),
            route_address: None,
            route_exclude_address: None,
            stack: Some(stack),
            interface_name: None,
            mtu: Some(mtu),
            sniff: Some(true),
            sniff_override_destination: None,
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
            congestion_controller: None,
            udp_relay_mode: None,
            zero_rtt_handshake: None,
            heartbeat: None,
            outbounds: None,
            url: None,
            interval: None,
            tolerance: None,
            packet_encoding: None,
            domain_strategy: None,
        });
        self
    }

    pub fn with_block(mut self) -> Self {
        if let Some(ref mut route) = self.route {
            route.rules.insert(
                0,
                RouteRule {
                    action: Some("reject".to_string()),
                    ..Default::default()
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
            congestion_controller: None,
            udp_relay_mode: None,
            zero_rtt_handshake: None,
            heartbeat: None,
            outbounds: None,
            url: None,
            interval: None,
            tolerance: None,
            packet_encoding: None,
            domain_strategy: None,
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
        insecure: bool,
        packet_encoding: Option<String>,
    ) -> Self {
        let mut transport_config = None;
        if let Some(t_type) = transport {
            let t_type_lower = t_type.trim().to_lowercase();
            if !t_type_lower.is_empty() && t_type_lower != "tcp" {
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
                    insecure: Some(insecure),
                    alpn: None,
                    utls: None,
                    reality: None,
                    disable_sni: None,
                })
            } else {
                None
            },
            connect_timeout: None,
            flow: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
            congestion_controller: None,
            udp_relay_mode: None,
            zero_rtt_handshake: None,
            heartbeat: None,
            outbounds: None,
            url: None,
            interval: None,
            tolerance: None,
            packet_encoding,
            domain_strategy: None,
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
        packet_encoding: Option<String>,
        fingerprint: Option<String>,
        public_key: Option<String>,
        short_id: Option<String>,
    ) -> Self {
        let mut transport_config = None;
        if let Some(t_type) = transport {
            let t_type_lower = t_type.trim().to_lowercase();
            if !t_type_lower.is_empty() && t_type_lower != "tcp" {
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
                    utls: fingerprint.map(|f| UtlsConfig {
                        enabled: true,
                        fingerprint: f,
                    }),
                    reality: if public_key.is_some() {
                        Some(RealityConfig {
                            enabled: true,
                            public_key: public_key.unwrap_or_default(),
                            short_id: short_id.unwrap_or_default(),
                        })
                    } else {
                        None
                    },
                    disable_sni: None,
                })
            } else {
                None
            },
            connect_timeout: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
            congestion_controller: None,
            udp_relay_mode: None,
            zero_rtt_handshake: None,
            heartbeat: None,
            outbounds: None,
            url: None,
            interval: None,
            tolerance: None,
            packet_encoding,
            domain_strategy: None,
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
        fingerprint: Option<String>,
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
                alpn: if alpn.is_none() || alpn.as_ref().unwrap().is_empty() {
                    Some(vec!["h3".to_string()])
                } else {
                    alpn
                },
                utls: fingerprint.map(|f| UtlsConfig {
                    enabled: true,
                    fingerprint: f,
                }),
                reality: None,
                disable_sni: None,
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
            congestion_controller: None,
            udp_relay_mode: None,
            zero_rtt_handshake: None,
            heartbeat: None,
            outbounds: None,
            url: None,
            interval: None,
            tolerance: None,
            packet_encoding: None,
            domain_strategy: None,
        });
        self
    }
    pub fn with_anytls_outbound(
        mut self,
        tag: &str,
        server: String,
        port: u16,
        password: String,
        tls: bool,
        insecure: bool,
        sni: Option<String>,
        alpn: Option<Vec<String>>,
        fingerprint: Option<String>,
        disable_sni: Option<bool>,
    ) -> Self {
        self.outbounds.push(Outbound {
            outbound_type: "anytls".to_string(),
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
            tls: if tls {
                Some(OutboundTls {
                    enabled: true,
                    server_name: sni.or(Some(server)),
                    insecure: Some(insecure),
                    alpn,
                    utls: fingerprint.map(|f| UtlsConfig {
                        enabled: true,
                        fingerprint: f,
                    }),
                    reality: None,
                    disable_sni,
                })
            } else {
                None
            },
            connect_timeout: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
            congestion_controller: None,
            udp_relay_mode: None,
            zero_rtt_handshake: None,
            heartbeat: None,
            outbounds: None,
            url: None,
            interval: None,
            tolerance: None,
            packet_encoding: None,
            domain_strategy: None,
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
        zero_rtt_handshake: Option<bool>,
        heartbeat: Option<String>,
        fingerprint: Option<String>,
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
                alpn: if alpn.is_none() || alpn.as_ref().unwrap().is_empty() {
                    Some(vec!["h3".to_string()])
                } else {
                    alpn
                },
                utls: fingerprint.map(|f| UtlsConfig {
                    enabled: true,
                    fingerprint: f,
                }),
                reality: None,
                disable_sni: None,
            }),
            connect_timeout: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
            congestion_controller,
            udp_relay_mode,
            zero_rtt_handshake,
            heartbeat,
            outbounds: None,
            url: None,
            interval: None,
            tolerance: None,
            packet_encoding: None,
            domain_strategy: None,
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
        tls: bool,
        insecure: bool,
        sni: Option<String>,
        alpn: Option<Vec<String>>,
        fingerprint: Option<String>,
        public_key: Option<String>,
        short_id: Option<String>,
    ) -> Self {
        let mut transport_config = None;
        if let Some(t_type) = transport {
            let t_type_lower = t_type.trim().to_lowercase();
            if !t_type_lower.is_empty() && t_type_lower != "tcp" {
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
            tls: if tls {
                Some(OutboundTls {
                    enabled: true,
                    server_name: sni.or(host).or(Some(server)),
                    insecure: Some(insecure),
                    alpn,
                    utls: fingerprint.map(|f| UtlsConfig {
                        enabled: true,
                        fingerprint: f,
                    }),
                    reality: if public_key.is_some() {
                        Some(RealityConfig {
                            enabled: true,
                            public_key: public_key.unwrap_or_default(),
                            short_id: short_id.unwrap_or_default(),
                        })
                    } else {
                        None
                    },
                    disable_sni: None,
                })
            } else {
                None
            },
            connect_timeout: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
            congestion_controller: None,
            udp_relay_mode: None,
            zero_rtt_handshake: None,
            heartbeat: None,
            outbounds: None,
            url: None,
            interval: None,
            tolerance: None,
            packet_encoding: None,
            domain_strategy: None,
        });
        self
    }

    pub fn with_selector_outbound(mut self, tag: &str, outbounds: Vec<String>) -> Self {
        self.outbounds.push(Outbound {
            outbound_type: "selector".to_string(),
            tag: tag.to_string(),
            server: None,
            server_port: None,
            method: None,
            password: None,
            uuid: None,
            security: None,
            flow: None,
            alter_id: None,
            transport: None,
            tls: None,
            connect_timeout: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
            congestion_controller: None,
            udp_relay_mode: None,
            zero_rtt_handshake: None,
            heartbeat: None,
            outbounds: Some(outbounds),
            url: None,
            interval: None,
            tolerance: None,
            packet_encoding: None,
            domain_strategy: None,
        });
        self
    }

    pub fn with_urltest_outbound(
        mut self,
        tag: &str,
        outbounds: Vec<String>,
        url: Option<String>,
        interval: Option<String>,
        tolerance: Option<u16>,
    ) -> Self {
        self.outbounds.push(Outbound {
            outbound_type: "urltest".to_string(),
            tag: tag.to_string(),
            server: None,
            server_port: None,
            method: None,
            password: None,
            uuid: None,
            security: None,
            flow: None,
            alter_id: None,
            transport: None,
            tls: None,
            connect_timeout: None,
            up_mbps: None,
            down_mbps: None,
            obfs: None,
            congestion_controller: None,
            udp_relay_mode: None,
            zero_rtt_handshake: None,
            heartbeat: None,
            outbounds: Some(outbounds),
            url: url.or(Some("http://www.gstatic.com/generate_204".to_string())),
            interval: interval.or(Some("10m".to_string())),
            tolerance: tolerance.or(Some(50)),
            packet_encoding: None,
            domain_strategy: None,
        });
        self
    }
}
