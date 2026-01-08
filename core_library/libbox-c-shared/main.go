package main

import "C"
import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"os"

	box "github.com/sagernet/sing-box"
	"github.com/sagernet/sing-box/include"
	"github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing-box/protocol/group"
	sjson "github.com/sagernet/sing/common/json"
	"github.com/sagernet/sing/common/metadata"
)

var (
	instance *box.Box
	mu       sync.Mutex
	cancel   context.CancelFunc

	currentLogLevel string = "info"
)

//export LibboxHello
func LibboxHello() *C.char {
	return C.CString("Hello from Go Libbox!")
}

//export LibboxStart
func LibboxStart(configJSON *C.char, logFD C.longlong) *C.char {
	mu.Lock()
	defer mu.Unlock()

	if logFD > 0 {
		f := os.NewFile(uintptr(logFD), "log")
		os.Stdout = f
		os.Stderr = f
	}

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

	// Sync current log level
	if options.Log != nil {
		currentLogLevel = options.Log.Level
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

//export LibboxStartMobile
func LibboxStartMobile(fd C.int, configJSON *C.char, logFD C.longlong) *C.char {
	mu.Lock()
	defer mu.Unlock()

	if logFD > 0 {
		f := os.NewFile(uintptr(logFD), "log")
		os.Stdout = f
		os.Stderr = f
	}

	if instance != nil {
		return C.CString("service already running")
	}

	configStr := C.GoString(configJSON)

	ctx, cancelFunc := context.WithCancel(context.Background())
	cancel = cancelFunc
	ctx = include.Context(ctx)

	// Inject FD into TUN inbounds if they don't have one
	var rawConfig map[string]any
	if err := sjson.UnmarshalContext(ctx, []byte(configStr), &rawConfig); err != nil {
		cancel()
		cancel = nil
		return C.CString(fmt.Sprintf("decode config error (map): %s", err))
	}

	if inbounds, ok := rawConfig["inbounds"].([]any); ok {
		for i, inbound := range inbounds {
			if inboundMap, ok := inbound.(map[string]any); ok {
				if inboundMap["type"] == "tun" {
					if _, exists := inboundMap["file_descriptor"]; !exists {
						inboundMap["file_descriptor"] = int(fd)
						inbounds[i] = inboundMap
					}
				}
			}
		}
		rawConfig["inbounds"] = inbounds
	}

	updatedConfig, err := sjson.Marshal(rawConfig)
	if err != nil {
		cancel()
		cancel = nil
		return C.CString(fmt.Sprintf("encode updated config error: %s", err))
	}

	var options option.Options
	if err := sjson.UnmarshalContext(ctx, updatedConfig, &options); err != nil {
		cancel()
		cancel = nil
		return C.CString(fmt.Sprintf("decode config error: %s", err))
	}

	// Sync current log level
	if options.Log != nil {
		currentLogLevel = options.Log.Level
	}

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
			Log: &option.LogOptions{
				Level: currentLogLevel,
			},
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

//export LibboxFetch
func LibboxFetch(outboundJSON *C.char, targetURL *C.char, timeoutMS C.longlong) *C.char {
	configStr := C.GoString(outboundJSON)
	target := C.GoString(targetURL)
	timeout := time.Duration(timeoutMS) * time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	// Ensure registries are initialized
	ctx = include.Context(ctx)

	// Try to unmarshal as generic map to check for _log_level
	var rawConfig map[string]interface{}
	sjson.UnmarshalContext(ctx, []byte(configStr), &rawConfig)

	// Determine Log Level
	logLevel := currentLogLevel
	if l, ok := rawConfig["_log_level"].(string); ok && l != "" {
		logLevel = l
	}

	var options option.Outbound
	if err := sjson.UnmarshalContext(ctx, []byte(configStr), &options); err != nil {
		return C.CString(fmt.Sprintf("decode config error: %v", err))
	}
	if options.Tag == "" {
		options.Tag = "test-fetch"
	}

	// Prepare minimal box options
	boxOptions := box.Options{
		Context: ctx,
		Options: option.Options{
			Log: &option.LogOptions{
				Level: logLevel,
			},
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

	resp, err := client.Do(req)
	if err != nil {
		return C.CString(fmt.Sprintf("request error: %v", err))
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return C.CString(fmt.Sprintf("read body error: %v", err))
	}

	return C.CString(string(body))
}

//export LibboxTestBatch
func LibboxTestBatch(outboundsJSON *C.char, targetURL *C.char, timeoutMS C.longlong) *C.char {
	configStr := C.GoString(outboundsJSON)
	target := C.GoString(targetURL)
	timeout := time.Duration(timeoutMS) * time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), timeout+2*time.Second)
	defer cancel()

	ctx = include.Context(ctx)

	// 1. Unmarshal wrapper first
	var wrapper struct {
		Outbounds []map[string]interface{} `json:"outbounds"`
		LogLevel  string                   `json:"log_level"`
	}

	var rawOutbounds []map[string]interface{}
	logLevel := currentLogLevel

	// Try unmarshal as wrapper object
	if err := sjson.UnmarshalContext(ctx, []byte(configStr), &wrapper); err == nil && len(wrapper.Outbounds) > 0 {
		rawOutbounds = wrapper.Outbounds
		if wrapper.LogLevel != "" {
			logLevel = wrapper.LogLevel
		}
	} else {
		// Fallback: try unmarshal as array (backward compatibility)
		if err := sjson.UnmarshalContext(ctx, []byte(configStr), &rawOutbounds); err != nil {
			return C.CString(fmt.Sprintf("{\"error\": \"decode config error: %v\"}", err))
		}
	}

	// 2. Extract tags for urltest group
	var outboundTags []string
	for i := range rawOutbounds {
		if tag, ok := rawOutbounds[i]["tag"].(string); ok && tag != "" {
			outboundTags = append(outboundTags, tag)
		} else {
			tag := fmt.Sprintf("test-%d", i)
			rawOutbounds[i]["tag"] = tag
			outboundTags = append(outboundTags, tag)
		}
	}

	// 3. Create URLTest Group Outbound
	urlTestGroup := map[string]interface{}{
		"type":      "urltest",
		"tag":       "global-test-group",
		"outbounds": outboundTags,
		"url":       target, // e.g. http://cp.cloudflare.com/generate_204
		"interval":  "10m",  // Prevent auto-retest during this short lifespan
	}

	// Add group to outbounds
	rawOutbounds = append(rawOutbounds, urlTestGroup)

	// 4. Inject direct & DNS (Standard Fast Path)
	hasDirect := false
	for _, out := range rawOutbounds {
		if t, ok := out["type"].(string); ok && t == "direct" {
			hasDirect = true
			break
		}
	}
	if !hasDirect {
		rawOutbounds = append(rawOutbounds, map[string]interface{}{
			"type": "direct",
			"tag":  "direct",
		})
	}

	fullConfig := map[string]interface{}{
		"log": map[string]interface{}{
			"level": logLevel,
		},
		"outbounds": rawOutbounds,
		"dns": map[string]interface{}{
			"servers": []map[string]interface{}{
				{
					"tag":     "dns-direct",
					"address": "8.8.8.8",
					"detour":  "direct",
				},
			},
		},
	}

	configBytes, err := sjson.Marshal(fullConfig)
	if err != nil {
		return C.CString(fmt.Sprintf("{\"error\": \"marshal config error: %v\"}", err))
	}

	var options option.Options
	if err := sjson.UnmarshalContext(ctx, configBytes, &options); err != nil {
		return C.CString(fmt.Sprintf("{\"error\": \"unmarshal options error: %v\"}", err))
	}

	// 5. Start Box
	boxOptions := box.Options{
		Context: ctx,
		Options: options,
	}

	tempInstance, err := box.New(boxOptions)
	if err != nil {
		return C.CString(fmt.Sprintf("{\"error\": \"create service error: %v\"}", err))
	}
	defer tempInstance.Close()

	if err := tempInstance.Start(); err != nil {
		return C.CString(fmt.Sprintf("{\"error\": \"start test service error: %v\"}", err))
	}

	// 6. Access the Group and Trigger Test
	// We need to access the internal adapter.
	// The variable 'tempInstance' exposes Outbound() which is a manager.
	outboundManager := tempInstance.Outbound()
	testGroup, ok := outboundManager.Outbound("global-test-group")
	if !ok {
		return C.CString("{\"error\": \"test group not found\"}")
	}

	// We need to cast it to the *group.URLTest type to call URLTest method.
	// However, we can't easily import 'protocol/group' due to visibility or circular deps if not careful.
	// But we vendored it, so let's import "github.com/sagernet/sing-box/protocol/group"

	urlTestInstance, ok := testGroup.(*group.URLTest)
	if !ok {
		return C.CString(fmt.Sprintf("{\"error\": \"invalid group type: %T\"}", testGroup))
	}

	// 7. Run Test via Native API
	results, err := urlTestInstance.URLTest(ctx)
	if err != nil {
		return C.CString(fmt.Sprintf("{\"error\": \"url test failed: %v\"}", err))
	}

	// 8. Marshal Results
	jsonBytes, err := sjson.Marshal(results)
	if err != nil {
		return C.CString("{}")
	}
	return C.CString(string(jsonBytes))
}
