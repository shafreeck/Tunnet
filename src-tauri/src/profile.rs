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
    pub web_page_url: Option<String>,
    pub update_interval: Option<u64>,
    pub header_update_interval: Option<u64>,
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

    // New fields for VLESS / Hysteria / TUIC / Reality
    pub flow: Option<String>,
    pub alpn: Option<Vec<String>>,
    #[serde(default)]
    pub insecure: bool,
    pub sni: Option<String>,
    pub public_key: Option<String>,
    pub short_id: Option<String>,
    pub fingerprint: Option<String>,
    pub up: Option<String>, // Bandwidth hint
    pub down: Option<String>,
    pub obfs: Option<String>, // Obfs type
    pub obfs_password: Option<String>,
    #[serde(default)]
    pub ping: Option<u64>,
    pub packet_encoding: Option<String>,
    pub disable_sni: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub enum GroupType {
    Selector,
    UrlTest {
        #[serde(default = "default_interval")]
        interval: u64,
        #[serde(default = "default_tolerance")]
        tolerance: u64,
    },
}

impl Serialize for GroupType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // Frontend expects simple strings "Selector" or "UrlTest"
        match self {
            GroupType::Selector => serializer.serialize_str("Selector"),
            GroupType::UrlTest { .. } => serializer.serialize_str("UrlTest"),
        }
    }
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
        serde_json::Value::Object(map) => {
            // Check for Legacy External Tag {"UrlTest": {...}}
            if let Some(inner) = map.get("UrlTest") {
                // Manually parse legacy format
                let interval = inner
                    .get("interval")
                    .and_then(|v| v.as_u64())
                    .unwrap_or_else(default_interval);
                let tolerance = inner
                    .get("tolerance")
                    .and_then(|v| v.as_u64())
                    .unwrap_or_else(default_tolerance);
                Ok(GroupType::UrlTest {
                    interval,
                    tolerance,
                })
            } else {
                // Check for Internal Tag "type": "UrlTest"
                if let Some(type_val) = map.get("type") {
                    if type_val == "UrlTest" {
                        let interval = map
                            .get("interval")
                            .and_then(|v| v.as_u64())
                            .unwrap_or_else(default_interval);
                        let tolerance = map
                            .get("tolerance")
                            .and_then(|v| v.as_u64())
                            .unwrap_or_else(default_tolerance);
                        return Ok(GroupType::UrlTest {
                            interval,
                            tolerance,
                        });
                    } else if type_val == "Selector" {
                        return Ok(GroupType::Selector);
                    }
                }

                // Fallback to default (Internal Tagged via #[serde(tag="type")] on enum)
                // Note: since we removed #[serde(tag="type")] from enum def to support string enum,
                // we might need manual parsing here if above fails.
                // But let's try standard deserialize.
                serde_json::from_value(serde_json::Value::Object(map))
                    .map_err(serde::de::Error::custom)
            }
        }
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
        let content = content.trim();
        if content.is_empty() {
            return vec![];
        }

        // 0. Try Parsing as sing-box JSON first (modern airports)
        if content.starts_with('{') {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(content) {
                if let Some(outbounds) = v.get("outbounds").and_then(|o| o.as_array()) {
                    let mut nodes = Vec::new();
                    for o in outbounds {
                        let tag = o.get("tag").and_then(|t| t.as_str()).unwrap_or("unnamed");
                        let protocol = o.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        let server = o.get("server").and_then(|s| s.as_str()).unwrap_or("");
                        let port =
                            o.get("server_port").and_then(|p| p.as_u64()).unwrap_or(0) as u16;

                        if server.is_empty()
                            || protocol.is_empty()
                            || protocol == "direct"
                            || protocol == "block"
                            || protocol == "dns"
                        {
                            continue;
                        }

                        nodes.push(Node {
                            id: Uuid::new_v4().to_string(),
                            name: tag.to_string(),
                            protocol: protocol.to_string(),
                            server: server.to_string(),
                            port,
                            uuid: o
                                .get("uuid")
                                .and_then(|u| u.as_str())
                                .map(|s| s.to_string()),
                            cipher: o
                                .get("method")
                                .and_then(|m| m.as_str())
                                .map(|s| s.to_string()),
                            password: o
                                .get("password")
                                .and_then(|p| p.as_str())
                                .map(|s| s.to_string()),
                            tls: o.get("tls").is_some(),
                            network: o
                                .get("transport")
                                .and_then(|t| t.get("type"))
                                .and_then(|t| t.as_str())
                                .map(|s| s.to_string()),
                            path: o
                                .get("transport")
                                .and_then(|t| t.get("path"))
                                .and_then(|p| p.as_str())
                                .map(|s| s.to_string()),
                            host: o
                                .get("transport")
                                .and_then(|t| t.get("headers"))
                                .and_then(|h| h.get("Host"))
                                .and_then(|h| h.as_str())
                                .map(|s| s.to_string()),
                            location: None,
                            flow: o
                                .get("flow")
                                .and_then(|f| f.as_str())
                                .map(|s| s.to_string()),
                            alpn: o
                                .get("tls")
                                .and_then(|t| t.get("alpn"))
                                .and_then(|a| a.as_array())
                                .map(|arr| {
                                    arr.iter()
                                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                        .collect()
                                }),
                            insecure: o
                                .get("tls")
                                .and_then(|t| t.get("insecure"))
                                .and_then(|i| i.as_bool())
                                .unwrap_or(false),
                            sni: o
                                .get("tls")
                                .and_then(|t| t.get("server_name"))
                                .and_then(|s| s.as_str())
                                .map(|s| s.to_string()),
                            disable_sni: o
                                .get("tls")
                                .and_then(|t| t.get("disable_sni"))
                                .and_then(|d| d.as_bool()),
                            public_key: o
                                .get("tls")
                                .and_then(|t| t.get("reality"))
                                .and_then(|r| r.get("public_key"))
                                .and_then(|p| p.as_str())
                                .map(|s| s.to_string()),
                            short_id: o
                                .get("tls")
                                .and_then(|t| t.get("reality"))
                                .and_then(|r| r.get("short_id"))
                                .and_then(|s| s.as_str())
                                .map(|s| s.to_string()),
                            fingerprint: o
                                .get("tls")
                                .and_then(|t| t.get("utls"))
                                .and_then(|u| u.get("fingerprint"))
                                .and_then(|f| f.as_str())
                                .map(|s| s.to_string()),
                            up: None,
                            down: None,
                            obfs: None,
                            obfs_password: None,
                            ping: None,
                            packet_encoding: None,
                        });
                    }
                    if !nodes.is_empty() {
                        return nodes;
                    }
                }
            }
        }

        // 1. Try Parsing as Clash YAML (fallback)
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
                        public_key: None,
                        short_id: None,
                        fingerprint: None,
                        up: None,
                        down: None,
                        obfs: None,
                        obfs_password: None,
                        ping: None,
                        packet_encoding: None,
                        disable_sni: None,
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
                        insecure: v
                            .get("insecure")
                            .or(v.get("allowInsecure"))
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false),
                        sni: v.get("sni").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        public_key: None,
                        short_id: None,
                        fingerprint: None,
                        up: None,
                        down: None,
                        obfs: None,
                        obfs_password: None,
                        ping: None,
                        packet_encoding: None,
                        disable_sni: None,
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
                                let mut insecure = false;

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
                                                "insecure" | "allowInsecure" => {
                                                    insecure = v == "1" || v == "true";
                                                }
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
                                    insecure,
                                    sni,
                                    public_key: None,
                                    short_id: None,
                                    fingerprint: None,
                                    up: None,
                                    down: None,
                                    obfs: None,
                                    obfs_password: None,
                                    ping: None,
                                    packet_encoding: None,
                                    disable_sni: None,
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
                            public_key: None,
                            short_id: None,
                            fingerprint: None,
                            up: None,
                            down: None,
                            obfs: None,
                            obfs_password: None,
                            ping: None,
                            packet_encoding: None,
                            disable_sni: None,
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
                                            let list: Vec<String> = v
                                                .split(',')
                                                .map(|s| s.trim().to_string())
                                                .filter(|s| !s.is_empty())
                                                .collect();
                                            if !list.is_empty() {
                                                node.alpn = Some(list);
                                            }
                                        }
                                        "fp" => node.fingerprint = Some(v),
                                        "pbk" => node.public_key = Some(v),
                                        "sid" => node.short_id = Some(v),
                                        "packetEncoding" => node.packet_encoding = Some(v),
                                        "insecure" | "allowInsecure" => {
                                            node.insecure = v == "1" || v == "true"
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
                            public_key: None,
                            short_id: None,
                            fingerprint: None,
                            up: None,
                            down: None,
                            obfs: None,
                            obfs_password: None,
                            ping: None,
                            packet_encoding: None,
                            disable_sni: None,
                        };

                        if let Some(q) = query {
                            for pair in q.split('&') {
                                if let Some((k, v)) = pair.split_once('=') {
                                    let v = urlencoding::decode(v).unwrap_or(v.into()).to_string();
                                    match k {
                                        "insecure" | "allowInsecure" => {
                                            node.insecure = v == "1" || v == "true"
                                        }
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
                            public_key: None,
                            short_id: None,
                            fingerprint: None,
                            up: None,
                            down: None,
                            obfs: None,
                            obfs_password: None,
                            ping: None,
                            packet_encoding: None,
                            disable_sni: None,
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
                                        "allow_insecure" | "insecure" | "allowInsecure" => {
                                            node.insecure = v == "1" || v == "true"
                                        }
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
                            public_key: None,
                            short_id: None,
                            fingerprint: None,
                            up: None,
                            down: None,
                            obfs: None,
                            obfs_password: None,
                            ping: None,
                            packet_encoding: None,
                            disable_sni: None,
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
                                            let list: Vec<String> = v
                                                .split(',')
                                                .map(|s| s.trim().to_string())
                                                .filter(|s| !s.is_empty())
                                                .collect();
                                            if !list.is_empty() {
                                                node.alpn = Some(list);
                                            }
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
