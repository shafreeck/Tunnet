#[cfg(test)]
mod tests {
    use crate::profile::parser::parse_subscription;

    #[test]
    fn test_parse_vless() {
        let uri = "vless://uuid@example.com:443?security=tls&type=ws&path=/&host=example.com&flow=xtls-rprx-vision&sni=example.com&alpn=h2,http/1.1#TestNode";
        let nodes = parse_subscription(uri);
        assert_eq!(nodes.len(), 1);
        let node = &nodes[0];
        assert_eq!(node.protocol, "vless");
        assert_eq!(node.flow, Some("xtls-rprx-vision".to_string()));
        assert_eq!(
            node.alpn,
            Some(vec!["h2".to_string(), "http/1.1".to_string()])
        );
        assert_eq!(node.sni, Some("example.com".to_string()));
    }

    #[test]
    fn test_parse_hysteria2() {
        let uri = "hysteria2://password@example.com:443?insecure=1&sni=example.com&obfs=salamander&obfs-password=pw#Hy2Node";
        let nodes = parse_subscription(uri);
        assert_eq!(nodes.len(), 1);
        let node = &nodes[0];
        assert_eq!(node.protocol, "hysteria2");
        assert_eq!(node.insecure, true);
        assert_eq!(node.obfs, Some("salamander".to_string()));
    }
}
