# Tunnet 多平台支持设计方案 (Libbox Unified Architectrue)

## 1. 核心理念与痛点分析

### 1.1 现状痛点 (Why not CLI?)
目前 Tunnet 通过 `std::process::Command` 调用 sing-box 命令行，这种方式在多平台扩展时面临严重问题：
*   **进程管理地狱**: 需手动监测 PIDs、处理僵尸/孤儿进程、应对 `kill` 信号的跨平台差异。
*   **端口与资源竞争**: 启动时的 "address already in use" 错误频发，依赖重试机制，不够优雅。
*   **交互受限**: 仅能通过 stdout/stderr 获取日志，无法获取深层运行时状态或精确实时流量。
*   **一致性差**: Mobile 必须用 Library，Desktop 用 CLI 导致两套核心逻辑。

### 1.2 新架构: Libbox Everywhere
**核心决策**: 全平台统一使用 **In-Process Library (Libbox)** 模式。弃用所有 CLI 子进程。

| 平台 | 集成方式 | 宿主进程 (Host Process) | 通信机制 |
| :--- | :--- | :--- | :--- |
| **macOS** | **Rust FFI (c-shared)** | `tunnet-helper` (Root) | Unix Domain Socket (Meta) |
| **Windows**| **Rust FFI (c-shared)** | Windows Service (System) | Named Pipe (Meta) |
| **Linux** | **Rust FFI (c-shared)** | `tunnet-helper` (Root/Cap) | Unix Domain Socket |
| **Android**| **JNI (gomobile)** | `VpnService` | AIDL / JNI Direct |
| **iOS** | **ObjC (gomobile)** | `NetworkExtension` | App Group / IPC |

这种架构下，**Helper 进程本身就是 Sing-box**。通过 FFI 加载核心逻辑，直接在内存中启停 Proxy 实例，彻底消除子进程管理和端口冲突（若使用内存堆栈）。

## 2. 模块重构与技术实现

### 2.1 Go Adapter (`libbox-c-shared`)
我们已经构建了一个 Go 模块 `core_library/libbox-c-shared`，导出 C ABI 兼容接口。

```go
// main.go
package main
import "C"
//export LibboxStart
func LibboxStart(config *C.char) *C.char { ... }
//export LibboxStop
func LibboxStop() { ... }
```

### 2.2 Build System Update
在 `src-tauri/build.rs` 中集成了 Go 编译流程：
1.  自动检测 Go 源码变更。
2.  执行 `go build -buildmode=c-archive -o libbox.a`。
3.  通过 `cargo:rustc-link-lib=static=box` 链接。
4.  自动注入 macOS 必要的 Frameworks (`Security`, `CoreFoundation`, `SystemConfiguration`, `resolv`)。

### 2.3 Rust FFI Wrapper
`tunnet-helper` 已经重构为：
```rust
#[link(name = "box")]
unsafe extern "C" {
    fn LibboxStart(...) -> ...;
}
```
直接调用内存函数，不再 spawn 子进程。

## 3. 分阶段开发规划 (Roadmap)

### Phase 1: 验证与原型 (Proof of Concept) [Done]
**目标**: 验证 Rust FFI 调用 Go 编译的 DLL/Dylib 在 macOS 上可行，且无严重 Crash。
*   **Result**: 成功构建 `core_library/libbox-c-shared`，并通过 C 和 Rust FFI (`libbox-ffi-test`) 验证了调用 `sing-box` 核心的能力。

### Phase 2: Refactor macOS Helper [Done]
**目标**: 改造 macOS `tunnet-helper`，使其内置 Libbox。
*   **Implementation Details**:
    *   **Static Linking**: 为了安全性与便携性，使用 `-buildmode=c-archive` 生成 `libbox.a` 并静态链接到 `tunnet-helper`。
    *   **Build System Integration**: 修改了 `src-tauri/build.rs`，自动编译 Go 代码并注入 Linker 参数。
    *   **Frameworks**: 显式链接了 macOS 系统框架 (`Security`, `CoreFoundation`, `SystemConfiguration`, `resolv`) 以满足 Go Runtime 和 Sing-box 的依赖。
    *   **Code**: `tunnet-helper` 现在是一个单一的守护进程，直接在内存中启动 Sing-box 实例，不再产生子进程。

### Phase 3: Windows Architecture [Next]
**目标**: 实现 Windows Service 宿主。
1.  创建 `tunnet-service` crate (Rust)，使用 `windows-service`。
2.  实现 Named Pipe Server。
3.  链接 `libbox.a` (或 `.dll` 若静态链接困难)。
4.  实现 `SystemOperations` for Windows (注册表代理设置)。

### Phase 4: Mobile Integration
**目标**: 移动端接入。
1.  iOS: 创建 Network Extension Target, 集成 `Use.framework` (Gomobile)。
2.  Android: 创建 VpnService, 集成 `.aar` (Gomobile)。
3.  Tauri Plugins: 编写插件将 UI 配置传递给 Native 层。

## 4. 总结
这个新架构彻底解决了“命令行进程管理”带来的所有痛点。 `tunnet-helper` (macOS) 目前已经是一个“原生 Sing-box”程序，启动速度更快，资源占用更稳，且无孤儿进程风险。
