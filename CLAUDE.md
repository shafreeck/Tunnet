# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Tunnet

Tunnet is a cross-platform proxy manager built with Tauri v2. It manages sing-box as its proxy engine, supporting protocols like VMess, VLESS, Shadowsocks, Trojan, Hysteria, and TUIC. The app provides subscription management, routing rules, node groups, and both TUN and HTTP proxy modes.

## Commands

### Development

```bash
npm run dev          # Start Next.js frontend only (port 4000, 127.0.0.1)
npm run tauri dev    # Full dev: build helper binary + run Tauri app
npm run tauri build  # Production build
npm run lint         # ESLint
```

### Building the helper binary separately

```bash
npm run build:helper                                         # Builds tunnet-helper for current platform
cargo build --bin tunnet-helper --release --target <target>  # Manual build from src-tauri/
```

The helper binary is auto-copied to `src-tauri/resources/bin/tunnet-helper` and is skipped if up to date.

## Architecture

### Two-process design

The app uses two separate Rust binaries:

1. **`Tunnet`** (`src-tauri/src/main.rs`) — the main Tauri app (user session)
2. **`tunnet-helper`** (`src-tauri/src/bin/helper.rs`) — a privileged daemon that runs sing-box with root/admin privileges for TUN mode

The main app communicates with the helper via:
- Unix socket at `/var/run/tunnet.sock` (macOS/Linux)
- Named pipe `\\.\pipe\tunnet` (Windows)

The helper must be installed separately (requires elevated privileges). `HelperInstaller` (`installer.rs`) handles this, and `HelperClient` (`helper_client.rs`) is the IPC client.

### Rust backend (`src-tauri/src/`)

- **`lib.rs`** — All Tauri IPC command handlers (`#[tauri::command]`). This is the entry point for all frontend→backend calls.
- **`service.rs`** — `ProxyService`: central state manager. Owns proxy lifecycle, node probing, group management, and Clash API interactions.
- **`manager.rs`** — `CoreManager`: file I/O for all persisted data (profiles, rules, groups, settings). In debug builds, data dir gets a `_dev` suffix to avoid corrupting production data.
- **`profile.rs`** — Core data models: `Node`, `Profile`, `Rule`, `Group`, `LocationInfo`.
- **`config.rs`** — Generates sing-box JSON config from app state.
- **`libbox.rs`** — FFI bindings to the sing-box C library (`libbox`/`libbox_ios`). Exposes `LibboxStart`, `LibboxStop`, `LibboxTestOutbound`, `LibboxTestBatch`, etc.
- **`settings.rs`** — `AppSettings` model with serde defaults.
- **`installer.rs`** — Helper binary installation with privilege escalation.
- **`helper_client.rs`** — Synchronous IPC client for communicating with the helper daemon.

### Frontend (`src/`)

- **`src/app/page.tsx`** — The main page. This is a large client component that owns nearly all app state and orchestrates the entire UI via Tauri `invoke` calls.
- **`src/app/tray/page.tsx`** — The tray popup window (separate Tauri webview).
- **`src/components/dashboard/`** — All view components (nodes, groups, subscriptions, rules, settings, logs, connections, proxies, locations).
- **`src/lib/settings.ts`** — Frontend mirror of `AppSettings`; reads/writes via the backend IPC.
- **`src/lib/rules.ts`** — Rule presets and rule set logic.
- **`src/lib/i18n.ts`** — i18next setup (English and Chinese).

### Data persistence

JSON files stored in the OS app local data dir:
- `profiles_v2.json` — subscriptions and manually added nodes
- `rules.json` — routing rules
- `groups.json` — node groups (selector/url-test)
- `settings.json` — app settings

### Proxy engine integration

sing-box is embedded as a native library (`libbox`). The Rust code calls into it via FFI in `libbox.rs`. For TUN mode, the helper process calls `LibboxStart` with elevated privileges. For HTTP proxy mode, the main process manages sing-box directly. The Clash-compatible API (default port configurable) is used for real-time group/proxy management.

### IPC pattern

Frontend → Rust: `invoke("command_name", { arg1, arg2 })` via `@tauri-apps/api/core`
Rust → Frontend: `app.emit("event-name", payload)` / `window.emit(...)` via Tauri's `Emitter`

All IPC commands are registered in `lib.rs`'s `invoke_handler![]` macro.
