package main

import "C"
import (
	"context"
	"fmt"
	"strings"
	"sync"

	box "github.com/sagernet/sing-box"
	"github.com/sagernet/sing-box/include"
	"github.com/sagernet/sing-box/option"
	sjson "github.com/sagernet/sing/common/json"
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
