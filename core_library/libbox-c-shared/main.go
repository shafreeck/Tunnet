package main

import "C"
import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	box "github.com/sagernet/sing-box"
	"github.com/sagernet/sing-box/include"
	"github.com/sagernet/sing-box/option"
	sjson "github.com/sagernet/sing/common/json"
	"github.com/sagernet/sing/common/metadata"
)

var (
	instance *box.Box
	mu       sync.Mutex
	cancel   context.CancelFunc
)

//export LibboxHello
func LibboxHello() *C.char {
	return C.CString("Hello from Go Libbox!")
}

//export LibboxStart
func LibboxStart(configJSON *C.char) *C.char {
	mu.Lock()
	defer mu.Unlock()

	if instance != nil {
		return C.CString("service already running")
	}

	configStr := C.GoString(configJSON)

	ctx, cancelFunc := context.WithCancel(context.Background())
	cancel = cancelFunc
	ctx = include.Context(ctx)

	var options option.Options
	if err := sjson.UnmarshalContext(ctx, []byte(configStr), &options); err != nil {
		cancel()
		cancel = nil
		return C.CString(fmt.Sprintf("decode config error: %s", err))
	}

	var err error
	// v1.12+ box.New might fail if registries are not in context?
	// But usually importing 'include' registers them globally or makes New work.
	// If this fails, we need to inspect how to initialize registries.
	instance, err = box.New(box.Options{
		Context: ctx,
		Options: options,
	})
	if err != nil {
		cancel()
		cancel = nil
		return C.CString(fmt.Sprintf("create service error: %s", err))
	}

	if err := instance.Start(); err != nil {
		instance.Close()
		instance = nil
		cancel()
		cancel = nil
		return C.CString(fmt.Sprintf("start service error: %s", err))
	}

	return nil // Success
}

//export LibboxStop
func LibboxStop() *C.char {
	mu.Lock()
	defer mu.Unlock()

	if instance == nil {
		return C.CString("service not running")
	}

	// Just close it
	if err := instance.Close(); err != nil {
		if strings.Contains(err.Error(), "service not running") {
			// ignore
		} else {
			return C.CString(fmt.Sprintf("close service error: %s", err))
		}
	}

	if cancel != nil {
		cancel()
		cancel = nil
	}
	instance = nil
	return nil
}

func main() {}

//export LibboxTestOutbound
func LibboxTestOutbound(outboundJSON *C.char, targetURL *C.char, timeoutMS C.longlong) *C.char {
	configStr := C.GoString(outboundJSON)
	target := C.GoString(targetURL)
	timeout := time.Duration(timeoutMS) * time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	// Ensure registries are initialized
	ctx = include.Context(ctx)

	var options option.Outbound
	if err := sjson.UnmarshalContext(ctx, []byte(configStr), &options); err != nil {
		return C.CString(fmt.Sprintf("decode config error: %v", err))
	}
	if options.Tag == "" {
		options.Tag = "test-outbound"
	}

	// Prepare minimal box options
	boxOptions := box.Options{
		Context: ctx,
		Options: option.Options{
			Outbounds: []option.Outbound{options},
		},
	}

	// box.New initializes everything but does not start anything until Start() is called.
	tempInstance, err := box.New(boxOptions)
	if err != nil {
		return C.CString(fmt.Sprintf("create service error: %v", err))
	}
	defer tempInstance.Close()

	if err := tempInstance.Start(); err != nil {
		return C.CString(fmt.Sprintf("start test service error: %v", err))
	}

	out, ok := tempInstance.Outbound().Outbound(options.Tag)
	if !ok {
		return C.CString("outbound not found after creation")
	}

	start := time.Now()

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			mAddr := metadata.ParseSocksaddr(addr)
			return out.DialContext(ctx, "tcp", mAddr)
		},
		DisableKeepAlives: true,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   timeout,
	}

	req, err := http.NewRequestWithContext(ctx, "GET", target, nil)
	if err != nil {
		return C.CString(fmt.Sprintf("create request error: %v", err))
	}

	// sing-box head requests might be blocked by some firewalls, but generate_204 usually works.
	resp, err := client.Do(req)
	if err != nil {
		return C.CString(fmt.Sprintf("request error: %v", err))
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return C.CString(fmt.Sprintf("unexpected status code: %d", resp.StatusCode))
	}

	latency := time.Since(start).Milliseconds()
	return C.CString(fmt.Sprintf("%d", latency))
}
