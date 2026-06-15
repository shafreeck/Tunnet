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

    #[test]
    fn test_parse_shadowrocket_vless() {
        let uri = "vless://OjYxOGQzNDk2LTM0OTctNGNhMC1mYWZhLWViMGExMmU1N2JkNkBseXJhLnJ1bjo0NDM?path=/pass&remarks=bypasswall(vultr)&obfsParam=%7B%22Host%22:%22lyra.run%22%7D&obfs=websocket&tls=1&udp=1";
        let nodes = parse_subscription(uri);
        assert_eq!(nodes.len(), 1);
        let node = &nodes[0];
        assert_eq!(node.protocol, "vless");
        assert_eq!(node.uuid, Some("618d3496-3497-4ca0-fafa-eb0a12e57bd6".to_string()));
        assert_eq!(node.server, "lyra.run");
        assert_eq!(node.port, 443);
        assert_eq!(node.path, Some("/pass".to_string()));
        assert_eq!(node.name, "bypasswall(vultr)");
        assert_eq!(node.network, Some("ws".to_string()));
        assert_eq!(node.host, Some("lyra.run".to_string()));
        assert_eq!(node.tls, true);
    }

    #[test]
    fn test_parse_shadowsocks() {
        // Standard SIP002 format (aes-128-gcm:test)
        let uri1 = "ss://YWVzLTEyOC1nY206dGVzdA@192.168.100.1:8888#Example1";
        let nodes1 = parse_subscription(uri1);
        assert_eq!(nodes1.len(), 1);
        let node1 = &nodes1[0];
        assert_eq!(node1.protocol, "shadowsocks");
        assert_eq!(node1.cipher, Some("aes-128-gcm".to_string()));
        assert_eq!(node1.password, Some("test".to_string()));
        assert_eq!(node1.server, "192.168.100.1");
        assert_eq!(node1.port, 8888);
        assert_eq!(node1.name, "Example1");

        // Legacy format (chacha20-ietf-poly1305:password)
        let uri2 = "ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpwYXNzd29yZEAxMjcuMC4wLjE6MTIzNA==#Example2";
        let nodes2 = parse_subscription(uri2);
        assert_eq!(nodes2.len(), 1);
        let node2 = &nodes2[0];
        assert_eq!(node2.protocol, "shadowsocks");
        assert_eq!(node2.cipher, Some("chacha20-ietf-poly1305".to_string()));
        assert_eq!(node2.password, Some("password".to_string()));
        assert_eq!(node2.server, "127.0.0.1");
        assert_eq!(node2.port, 1234);
        assert_eq!(node2.name, "Example2");
    }
}
