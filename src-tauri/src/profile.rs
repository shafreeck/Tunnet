use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationInfo {
    pub ip: String,
    pub country: String,
    pub city: String,
    pub lat: f64,
    pub lon: f64,
    pub isp: String,
    #[serde(default)]
    pub latency: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub rule_type: String, // DOMAIN, DOMAIN_SUFFIX, DOMAIN_KEYWORD, IP_CIDR, GEOIP
    pub value: String,
    pub policy: String, // PROXY, DIRECT, REJECT
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
    pub upload: Option<u64>,
    pub download: Option<u64>,
    pub total: Option<u64>,
    pub expire: Option<u64>,
    pub nodes: Vec<Node>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub name: String,
    pub protocol: String, // "vmess", "shadowsocks", "trojan", etc.
    pub server: String,
    pub port: u16,
    // Protocol specific fields are flattened for simplicity in storage,
    // but in a real app we might use an enum with tag.
    // For now, let's keep it simple key-value map or specific optional fields.
    pub uuid: Option<String>,
    pub cipher: Option<String>,
    pub password: Option<String>,
    #[serde(default)]
    pub tls: bool,
    pub network: Option<String>, // "ws", "grpc", "tcp"
    pub path: Option<String>,    // "/path" for ws/grpc
    pub host: Option<String>,    // Host header for ws/grpc
    pub location: Option<LocationInfo>,

    // New fields for VLESS / Hysteria / TUIC
    pub flow: Option<String>,
    pub alpn: Option<Vec<String>>,
    #[serde(default)]
    pub insecure: bool,
    pub sni: Option<String>,
    pub up: Option<String>, // Bandwidth hint
    pub down: Option<String>,
    pub obfs: Option<String>, // Obfs type
    pub obfs_password: Option<String>,
    #[serde(default)]
    pub ping: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionInfo {
    pub upload: u64,
    pub download: u64,
    pub total: u64,
    pub expire: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GroupType {
    Selector,
    UrlTest {
        #[serde(default = "default_interval")]
        interval: u64,
        #[serde(default = "default_tolerance")]
        tolerance: u64,
    },
}

fn default_interval() -> u64 {
    600
}

fn default_tolerance() -> u64 {
    50
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupFilter {
    pub keywords: Option<Vec<String>>,
    // We can add more filter criteria here (e.g. subscription_id, country, etc.)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum GroupSource {
    Static { node_ids: Vec<String> },
    Filter { criteria: GroupFilter },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    #[serde(deserialize_with = "deserialize_group_type")]
    pub group_type: GroupType,
    pub source: GroupSource,
    pub icon: Option<String>,
    pub selected: Option<String>,
}

fn deserialize_group_type<'de, D>(deserializer: D) -> Result<GroupType, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v = serde_json::Value::deserialize(deserializer)?;
    match v {
        serde_json::Value::String(s) => match s.as_str() {
            "Selector" => Ok(GroupType::Selector),
            "UrlTest" => Ok(GroupType::UrlTest {
                interval: default_interval(),
                tolerance: default_tolerance(),
            }),
            _ => Err(serde::de::Error::unknown_variant(
                &s,
                &["Selector", "UrlTest"],
            )),
        },
        _ => serde_json::from_value(v).map_err(serde::de::Error::custom),
    }
}

pub mod parser {
    use super::*;
    use base64::{engine::general_purpose, Engine as _};
    use log::warn;
    use uuid::Uuid;

    #[derive(Debug, Deserialize)]
    struct ClashConfig {
        proxies: Option<Vec<ClashProxy>>,
    }

    #[derive(Debug, Deserialize)]
    #[allow(dead_code)]
    struct ClashProxy {
        name: String,
        #[serde(rename = "type")]
        proxy_type: String,
        server: String,
        port: u16,
        // vmess specific
        uuid: Option<String>,
        cipher: Option<String>,
        tls: Option<bool>,
        #[serde(rename = "network")]
        network: Option<String>,
        #[serde(rename = "ws-opts")]
        ws_opts: Option<ClashWsOpts>,
        #[serde(rename = "ws-path")]
        ws_path: Option<String>,
        #[serde(rename = "ws-headers")]
        ws_headers: Option<std::collections::HashMap<String, String>>,
        #[serde(rename = "skip-cert-verify")]
        skip_cert_verify: Option<bool>,
        // shadowsocks specific
        password: Option<String>,
        // simple-obfs / v2ray-plugin
        plugin: Option<String>,
        #[serde(rename = "plugin-opts")]
        plugin_opts: Option<ClashPluginOpts>,
    }

    #[derive(Debug, Deserialize)]
    #[allow(dead_code)]
    struct ClashWsOpts {
        path: Option<String>,
        headers: Option<std::collections::HashMap<String, String>>,
    }

    #[derive(Debug, Deserialize)]
    #[allow(dead_code)]
    struct ClashPluginOpts {
        mode: Option<String>,
        host: Option<String>,
    }

    pub fn parse_subscription(content: &str) -> Vec<Node> {
        // 0. Try Parsing as Clash YAML first
        if let Ok(clash_cfg) = serde_yaml::from_str::<ClashConfig>(content) {
            if let Some(proxies) = clash_cfg.proxies {
                let mut nodes = Vec::new();
                for p in proxies {
                    let mut node = Node {
                        id: Uuid::new_v4().to_string(),
                        name: p.name,
                        protocol: p.proxy_type.to_lowercase(),
                        server: p.server,
                        port: p.port,
                        uuid: p.uuid,
                        cipher: p.cipher,
                        password: p.password,
                        tls: p.tls.unwrap_or(false),
                        network: p.network,
                        path: None,
                        host: None,
                        location: None,
                        flow: None,
                        alpn: None,
                        insecure: p.skip_cert_verify.unwrap_or(false),
                        sni: None,
                        up: None,
                        down: None,
                        obfs: None,
                        obfs_password: None,
                        ping: None,
                    };

                    // Map specific fields
                    if node.protocol == "vmess" {
                        if let Some(ws) = p.ws_opts {
                            if let Some(path) = ws.path {
                                node.path = Some(path);
                            }
                            if let Some(headers) = ws.headers {
                                if let Some(host) = headers.get("Host") {
                                    node.host = Some(host.clone());
                                }
                            }
                        }
                        if node.path.is_none() {
                            node.path = p.ws_path;
                        }
                    } else if node.protocol == "ss" || node.protocol == "shadowsocks" {
                        node.protocol = "shadowsocks".to_string();
                    }

                    nodes.push(node);
                }
                if !nodes.is_empty() {
                    return nodes;
                }
            }
        }

        let mut nodes = Vec::new();
        // 1. Try Base64 decode content first (SIP002 format often is base64 encoded list)
        let decoded = match general_purpose::STANDARD.decode(content.trim()) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(_) => content.to_string(), // Maybe plaintext line separated
        };

        for line in decoded.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Some(node) = parse_link(line) {
                nodes.push(node);
            }
        }
        if !nodes.is_empty() {
            return nodes;
        }

        // 1. Try Base64 decode content first (SIP002 format often is base64 encoded list)
        let decoded = match general_purpose::STANDARD.decode(content.trim()) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(_) => content.to_string(), // Maybe plaintext line separated
        };

        for line in decoded.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Some(node) = parse_link(line) {
                nodes.push(node);
            } else {
                warn!("parse_link failed for line: {}", line);
            }
        }

        nodes
    }

    fn parse_link(link: &str) -> Option<Node> {
        if link.starts_with("vmess://") {
            let b64_part = if let Some(idx) = link.find('?') {
                &link[8..idx]
            } else {
                &link[8..]
            };

            // decoding vmess base64
            if let Ok(json_bytes) = general_purpose::STANDARD.decode(b64_part) {
                // Try JSON format first
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&json_bytes) {
                    return Some(Node {
                        id: Uuid::new_v4().to_string(),
                        name: v
                            .get("ps")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unnamed")
                            .to_string(),
                        protocol: "vmess".to_string(),
                        server: v
                            .get("add")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        port: v
                            .get("port")
                            .and_then(|v| {
                                v.as_str().or(match v.as_u64() {
                                    Some(_) => Some("0"),
                                    None => None,
                                })
                            })
                            .unwrap_or("0")
                            .parse()
                            .unwrap_or(0),
                        uuid: v.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        cipher: Some("auto".to_string()),
                        password: None,
                        tls: v.get("tls").and_then(|v| v.as_str()) == Some("tls"),
                        network: v.get("net").and_then(|v| v.as_str()).map(|s| {
                            if s == "websocket" {
                                "ws".to_string()
                            } else {
                                s.to_string()
                            }
                        }),
                        path: v
                            .get("path")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        host: v
                            .get("host")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        location: None,
                        flow: None,
                        alpn: None,
                        insecure: false,
                        sni: v.get("sni").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        up: None,
                        down: None,
                        obfs: None,
                        obfs_password: None,
                        ping: None,
                    });
                } else {
                    // Try legacy format: security:uuid@host:port
                    let decoded_str = String::from_utf8_lossy(&json_bytes);
                    if let Some((security_uuid, host_port)) = decoded_str.split_once('@') {
                        if let Some((_security, uuid)) = security_uuid.split_once(':') {
                            if let Some((host, port_str)) = host_port.rsplit_once(':') {
                                // Parse query params
                                let mut name = "Imported Vmess".to_string();
                                let mut network = None;
                                let mut tls = false;
                                let mut path = None;
                                let mut host_header = None;
                                let mut sni = None;

                                if let Some(query_start) = link.find('?') {
                                    let query = &link[query_start + 1..];
                                    for pair in query.split('&') {
                                        if let Some((k, v)) = pair.split_once('=') {
                                            match k {
                                                "remarks" => {
                                                    name = urlencoding::decode(v)
                                                        .unwrap_or(v.into())
                                                        .to_string()
                                                }
                                                "obfs" => {
                                                    network = Some(if v == "websocket" {
                                                        "ws".to_string()
                                                    } else {
                                                        v.to_string()
                                                    })
                                                }
                                                "tls" => tls = v == "1",
                                                "path" => path = Some(v.to_string()),
                                                "obfsParam" => host_header = Some(v.to_string()),
                                                "peer" => sni = Some(v.to_string()),
                                                _ => {}
                                            }
                                        }
                                    }
                                }

                                return Some(Node {
                                    id: Uuid::new_v4().to_string(),
                                    name,
                                    protocol: "vmess".to_string(),
                                    server: host.to_string(),
                                    port: port_str.parse().unwrap_or(0),
                                    uuid: Some(uuid.to_string()),
                                    cipher: Some("auto".to_string()),
                                    password: None,
                                    tls,
                                    network,
                                    path,
                                    host: host_header,
                                    location: None,
                                    flow: None,
                                    alpn: None,
                                    insecure: false,
                                    sni,
                                    up: None,
                                    down: None,
                                    obfs: None,
                                    obfs_password: None,
                                    ping: None,
                                });
                            }
                        }
                    }
                }
            }
        } else if link.starts_with("ss://") {
            // Basic SS placeholder - existing code logic seems limited,
            // but for now we focus on adding NEW protocols.
            // TODO: Enhance SS parsing if needed.
        } else if link.starts_with("vless://") {
            // vless://uuid@host:port?params#name
            if let Some(remainder) = link.strip_prefix("vless://") {
                let (user_host_port, fragment) = match remainder.split_once('#') {
                    Some((u, f)) => (
                        u,
                        Some(urlencoding::decode(f).unwrap_or(f.into()).to_string()),
                    ),
                    None => (remainder, None),
                };

                let (user_host_port, query) = match user_host_port.split_once('?') {
                    Some((u, q)) => (u, Some(q)),
                    None => (user_host_port, None),
                };

                if let Some((uuid, host_port)) = user_host_port.split_once('@') {
                    if let Some((host, port_str)) = host_port.rsplit_once(':') {
                        let mut node = Node {
                            id: Uuid::new_v4().to_string(),
                            name: fragment.unwrap_or("VLESS Node".to_string()),
                            protocol: "vless".to_string(),
                            server: host.to_string(),
                            port: port_str.parse().unwrap_or(443),
                            uuid: Some(uuid.to_string()),
                            cipher: None,
                            password: None,
                            tls: false, // Default to false, check security param
                            network: Some("tcp".to_string()),
                            path: None,
                            host: None,
                            location: None,
                            flow: None,
                            alpn: None,
                            insecure: false,
                            sni: None,
                            up: None,
                            down: None,
                            obfs: None,
                            obfs_password: None,
                            ping: None,
                        };

                        if let Some(q) = query {
                            for pair in q.split('&') {
                                if let Some((k, v)) = pair.split_once('=') {
                                    let v = urlencoding::decode(v).unwrap_or(v.into()).to_string();
                                    match k {
                                        "security" => node.tls = v == "tls" || v == "reality",
                                        "flow" => node.flow = Some(v),
                                        "type" => node.network = Some(v),
                                        "path" => node.path = Some(v),
                                        "host" => node.host = Some(v),
                                        "sni" => node.sni = Some(v),
                                        "alpn" => {
                                            node.alpn =
                                                Some(v.split(',').map(|s| s.to_string()).collect())
                                        }
                                        "fp" => {}  // fingerprint, not currently used
                                        "pbk" => {} // reality public key, TODO
                                        "sid" => {} // reality short id, TODO
                                        _ => {}
                                    }
                                }
                            }
                        }
                        return Some(node);
                    }
                }
            }
        } else if link.starts_with("hysteria2://") || link.starts_with("hy2://") {
            // hysteria2://password@host:port?params#name
            let prefix = if link.starts_with("hysteria2://") {
                "hysteria2://"
            } else {
                "hy2://"
            };
            if let Some(remainder) = link.strip_prefix(prefix) {
                let (user_host_port, fragment) = match remainder.split_once('#') {
                    Some((u, f)) => (
                        u,
                        Some(urlencoding::decode(f).unwrap_or(f.into()).to_string()),
                    ),
                    None => (remainder, None),
                };

                let (user_host_port, query) = match user_host_port.split_once('?') {
                    Some((u, q)) => (u, Some(q)),
                    None => (user_host_port, None),
                };

                if let Some((password, host_port)) = user_host_port.split_once('@') {
                    if let Some((host, port_str)) = host_port.rsplit_once(':') {
                        let mut node = Node {
                            id: Uuid::new_v4().to_string(),
                            name: fragment.unwrap_or("Hysteria2 Node".to_string()),
                            protocol: "hysteria2".to_string(),
                            server: host.to_string(),
                            port: port_str.parse().unwrap_or(443),
                            uuid: None,
                            cipher: None,
                            password: Some(password.to_string()),
                            tls: true,     // Hy2 is always TLS/QUIC
                            network: None, // usually udp/quic implied
                            path: None,
                            host: None,
                            location: None,
                            flow: None,
                            alpn: None,
                            insecure: false,
                            sni: None,
                            up: None,
                            down: None,
                            obfs: None,
                            obfs_password: None,
                            ping: None,
                        };

                        if let Some(q) = query {
                            for pair in q.split('&') {
                                if let Some((k, v)) = pair.split_once('=') {
                                    let v = urlencoding::decode(v).unwrap_or(v.into()).to_string();
                                    match k {
                                        "insecure" => node.insecure = v == "1",
                                        "sni" => node.sni = Some(v),
                                        "obfs" => node.obfs = Some(v), // type
                                        "obfs-password" => node.obfs_password = Some(v),
                                        "alpn" => {
                                            node.alpn =
                                                Some(v.split(',').map(|s| s.to_string()).collect())
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                        return Some(node);
                    }
                }
            }
        } else if link.starts_with("tuic://") {
            // tuic://uuid:password@host:port?params#name
            if let Some(remainder) = link.strip_prefix("tuic://") {
                let (user_host_port, fragment) = match remainder.split_once('#') {
                    Some((u, f)) => (
                        u,
                        Some(urlencoding::decode(f).unwrap_or(f.into()).to_string()),
                    ),
                    None => (remainder, None),
                };

                let (user_host_port, query) = match user_host_port.split_once('?') {
                    Some((u, q)) => (u, Some(q)),
                    None => (user_host_port, None),
                };

                if let Some((auth, host_port)) = user_host_port.split_once('@') {
                    let (uuid, password) = match auth.split_once(':') {
                        Some((u, p)) => (u.to_string(), Some(p.to_string())),
                        None => (auth.to_string(), None),
                    };

                    if let Some((host, port_str)) = host_port.rsplit_once(':') {
                        let mut node = Node {
                            id: Uuid::new_v4().to_string(),
                            name: fragment.unwrap_or("TUIC Node".to_string()),
                            protocol: "tuic".to_string(),
                            server: host.to_string(),
                            port: port_str.parse().unwrap_or(443),
                            uuid: Some(uuid),
                            cipher: None,
                            password,
                            tls: true, // TUIC is QUIC based
                            network: None,
                            path: None,
                            host: None,
                            location: None,
                            flow: None,
                            alpn: None,
                            insecure: false,
                            sni: None,
                            up: None,
                            down: None,
                            obfs: None,
                            obfs_password: None,
                            ping: None,
                        };

                        if let Some(q) = query {
                            for pair in q.split('&') {
                                if let Some((k, v)) = pair.split_once('=') {
                                    let v = urlencoding::decode(v).unwrap_or(v.into()).to_string();
                                    match k {
                                        "sni" => node.sni = Some(v),
                                        "alpn" => {
                                            node.alpn =
                                                Some(v.split(',').map(|s| s.to_string()).collect())
                                        }
                                        "allow_insecure" => node.insecure = v == "1",
                                        "congestion_control" => {} // TODO
                                        _ => {}
                                    }
                                }
                            }
                        }
                        return Some(node);
                    }
                }
            }
        } else if link.starts_with("trojan://") {
            // trojan://password@host:port?params#name
            if let Some(remainder) = link.strip_prefix("trojan://") {
                let (user_host_port, fragment) = match remainder.split_once('#') {
                    Some((u, f)) => (
                        u,
                        Some(urlencoding::decode(f).unwrap_or(f.into()).to_string()),
                    ),
                    None => (remainder, None),
                };

                let (user_host_port, query) = match user_host_port.split_once('?') {
                    Some((u, q)) => (u, Some(q)),
                    None => (user_host_port, None),
                };

                if let Some((password, host_port)) = user_host_port.split_once('@') {
                    if let Some((host, port_str)) = host_port.rsplit_once(':') {
                        let mut node = Node {
                            id: Uuid::new_v4().to_string(),
                            name: fragment.unwrap_or("Trojan Node".to_string()),
                            protocol: "trojan".to_string(),
                            server: host.to_string(),
                            port: port_str.parse().unwrap_or(443),
                            uuid: None,
                            cipher: None,
                            password: Some(password.to_string()),
                            tls: true,
                            network: Some("tcp".to_string()),
                            path: None,
                            host: None, // This is for Headers host
                            location: None,
                            flow: None,
                            alpn: None,
                            insecure: false,
                            sni: None,
                            up: None,
                            down: None,
                            obfs: None,
                            obfs_password: None,
                            ping: None,
                        };

                        if let Some(q) = query {
                            for pair in q.split('&') {
                                if let Some((k, v)) = pair.split_once('=') {
                                    let v = urlencoding::decode(v).unwrap_or(v.into()).to_string();
                                    match k {
                                        "allowInsecure" | "insecure" => node.insecure = v == "1",
                                        "peer" | "sni" => node.sni = Some(v),
                                        "type" => node.network = Some(v),
                                        "path" => node.path = Some(v),
                                        "host" => node.host = Some(v),
                                        "alpn" => {
                                            node.alpn =
                                                Some(v.split(',').map(|s| s.to_string()).collect())
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                        return Some(node);
                    }
                }
            }
        }
        None
    }
}
