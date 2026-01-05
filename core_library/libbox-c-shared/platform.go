package main

import (
	"context"
	"fmt"
	"sync"

	"github.com/sagernet/sing-box/experimental/libbox"
)

// PlatformInterface implementation for Desktop
type CommandPlatformInterface struct{}

func (p *CommandPlatformInterface) LocalDNSTransport() libbox.LocalDNSTransport {
	return nil
}

func (p *CommandPlatformInterface) UsePlatformAutoDetectInterfaceControl() bool {
	return false
}

func (p *CommandPlatformInterface) AutoDetectInterfaceControl(fd int32) error {
	return nil
}

func (p *CommandPlatformInterface) OpenTun(options libbox.TunOptions) (int32, error) {
	return -1, fmt.Errorf("not implemented")
}

func (p *CommandPlatformInterface) WriteLog(message string) {
	fmt.Print(message) // Forward to stdout, where our Rust helper captures it
}

func (p *CommandPlatformInterface) UseProcFS() bool {
	return true // Linux/macOS usually have access to proc-like info or lsof
}

func (p *CommandPlatformInterface) FindConnectionOwner(ipProtocol int32, sourceAddress string, sourcePort int32, destinationAddress string, destinationPort int32) (int32, error) {
	return 0, nil
}

func (p *CommandPlatformInterface) PackageNameByUid(uid int32) (string, error) {
	return "", nil
}

func (p *CommandPlatformInterface) UIDByPackageName(packageName string) (int32, error) {
	return 0, nil
}

func (p *CommandPlatformInterface) StartDefaultInterfaceMonitor(listener libbox.InterfaceUpdateListener) error {
	return nil
}

func (p *CommandPlatformInterface) CloseDefaultInterfaceMonitor(listener libbox.InterfaceUpdateListener) error {
	return nil
}

func (p *CommandPlatformInterface) GetInterfaces() (libbox.NetworkInterfaceIterator, error) {
	return nil, nil
}

func (p *CommandPlatformInterface) UnderNetworkExtension() bool {
	return false
}

func (p *CommandPlatformInterface) IncludeAllNetworks() bool {
	return false
}

func (p *CommandPlatformInterface) ReadWIFIState() *libbox.WIFIState {
	return nil
}

func (p *CommandPlatformInterface) SystemCertificates() libbox.StringIterator {
	return nil
}

func (p *CommandPlatformInterface) ClearDNSCache() {
}

func (p *CommandPlatformInterface) SendNotification(notification *libbox.Notification) error {
	return nil
}

var (
	instance *libbox.BoxService
	mu       sync.Mutex
	cancel   context.CancelFunc
)
