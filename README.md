# Tunnet

<p align="center">
  <img src="public/logo.png" alt="Tunnet Logo" width="128" height="128" />
</p>

<p align="center">
  <strong>A modern, cross-platform proxy client based on Tauri and sing-box.</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="assets/screenshots/demo.gif" alt="Tunnet Demo" width="100%" />
</p>


---

Tunnet is a powerful yet elegant proxy client designed for the modern web. Built with the speed of Rust (Tauri) and the versatility of sing-box, it provides a seamless experience for managing your network traffic across macOS, Windows, and Linux.

### ✨ Features

- 🎨 **Premium UI/UX**: High-performance dashboard with a stunning map visualization, smooth animations, and a polished dark/light mode interface.
- 🚀 **Powered by sing-box**: Industry-leading core for high-performance networking and low latency.
- 🛡️ **TUN Mode & System Proxy**: Full system-level proxy support with a simple toggle.
- 🌍 **Global Map Visualization**: Real-time traffic monitoring and node distribution on an interactive world map.
- 🛠️ **Smart Routing Presets**: 
  - **Smart Connect**: Automatically bypasses Mainland China traffic and blocks ads.
  - **Global Proxy/Direct**: Quick switching between global modes.
  - **Bypass LAN & CN**: Optimized for low-latency local access.
- ⚡ **Latency Testing**: Real-time HTTP/TCP latency testing with accurate node selection.
- 🔗 **Deep Link Support**: Import subscriptions effortlessly via `tunnet://` or `sing-box://` links.
- 💻 **Cross-Platform**: Consistent experience across macOS, Windows, and Linux (GNOME support included).
- 🌐 **Multi-language**: Fully localized in English and Simplified Chinese.

### 🛠️ Tech Stack

- **Frontend**: Next.js, TypeScript, Tailwind CSS (v4), shadcn/ui.
- **Backend**: Rust (Tauri), Go (sing-box core via FFI).
- **Communication**: Tauri IPC and Deep Links.

### 🚀 Getting Started

#### Prerequisites
- Node.js (v20 or later)
- Rust (latest stable)
- Go (for core library compilation)

#### Development
```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

#### Build
```bash
# Build for production
npm run build
npm run tauri build
```

---

<p align="center">
  Made with ❤️ by the Tunnet Team
</p>
