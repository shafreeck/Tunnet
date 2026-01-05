import NetworkExtension
import Libbox // Assuming the Go library is linked as Libbox

public class PacketTunnelProvider: NEPacketTunnelProvider {

    public override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping @Sendable (Error?) -> Void) {
        let tunnelNetworkSettings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
        
        let ipv4Settings = NEIPv4Settings(addresses: ["172.19.0.1"], subnetMasks: ["255.255.255.252"])
        ipv4Settings.includedRoutes = [NEIPv4Route.default()]
        tunnelNetworkSettings.ipv4Settings = ipv4Settings
        
        tunnelNetworkSettings.dnsSettings = NEDNSSettings(servers: ["1.1.1.1"])
        
        setTunnelNetworkSettings(tunnelNetworkSettings) { error in
            if let error = error {
                completionHandler(error)
                return
            }
            
            // Get the TUN FD
            // In iOS, we get the FD from the packetFlow
            // However, NEPacketTunnelProvider doesn't expose FD directly easily.
            // Usually, we use a Go-side Tun implementation that accepts the packetFlow or use a trick to get FD.
            // For Libbox, we might need a specific integration here.
            
            completionHandler(nil)
        }
    }
    
    public override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping @Sendable () -> Void) {
        // LibboxStop()
        completionHandler()
    }
}
