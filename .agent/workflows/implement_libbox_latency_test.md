---
description: Implement True HTTP Latency Testing via Libbox FFI
---

# User Objective
- Implement accurate latency testing that reflects real HTTP connection delay (not just TCP RTT).
- Ensure this works even when the main proxy is NOT running.
- Avoid spawning `sing-box` binary sub-processes.
- Use `libbox`'s internal capability to dial proxy connections directly.

# Strategy: Temporary Outbound Direct Dial
Instead of configuring a full `sing-box` instance with Inbounds/Outbounds/Routing, we can leverage `sing-box`'s `outbound.New` and `DialContext` APIs to create ephemeral outbound connections.

However, the current FFI (`LibboxStart`, `LibboxStop`) only supports managing a global `box.Box` instance. To support granular testing, we need to expose a new FFI function: `LibboxTestOutbound`.

## 1. Modify Go Side (`core_library/libbox-c-shared/main.go`)
- Create a new exported function `LibboxTestOutbound`.
- **Inputs**:
    - `configJSON`: A JSON string describing *only* the specific outbound to test (shadowsocks/vmess/etc config).
    - `targetURL`: The URL to test against (e.g., "http://www.gstatic.com/generate_204").
    - `timeoutMS`: Timeout in milliseconds.
- **Logic**:
    1. Parse the outbound config.
    2. Initialize the `outbound` using `outbound.New` (requires context with registries).
    3. Construct a `metadata.Socksaddr` for the target URL host.
    4. Call `outbound.DialContext` to establish a connection.
    5. Perform a simple HTTP HEAD/GET request over the connection.
    6. Return the latency in milliseconds.

## 2. Modify Rust Side (`src-tauri/src/libbox.rs`)
- Declare `LibboxTestOutbound` in the `extern "C"` block.

## 3. Update Rust Service (`src-tauri/src/service.rs`)
- Update `probe_nodes_latency` and `url_test` to use `unsafe { libbox::LibboxTestOutbound(...) }`.
- This removes the need for `reqwest` fallback or TCP ping fallback. It becomes the unified way to test.
- We need to construct a partial `SingBoxConfig` or just the `Outbound` part of it to pass to Go.

# Steps

1.  **Go: Add FFI Function**
    - Edit `core_library/libbox-c-shared/main.go`
    - Add `func LibboxTestOutbound(outboundJSON *C.char, targetURL *C.char, timeout C.longlong) C.longlong`
    - Ensure it handles `context` and `registries` correctly (similar to `LibboxStart`).
    - Use `http.Transport` with a custom `DialContext` that uses the outbound.

2.  **Go: Rebuild Library**
    - Run `go build -buildmode=c-archive ...` to update `libbox.a` and `libbox.h`.

3.  **Rust: Update Bindings**
    - Update `src-tauri/src/libbox.rs`.

4.  **Rust: Implement Logic**
    - In `src-tauri/src/service.rs`, replace existing `probe` logic.
    - We might need a helper method to serialize a single `Node` into a sing-box `Outbound` JSON configuration.

5.  **Clean Up**
    - Remove the TCP Ping fallback logic.

