mod config;
mod helper_client;
mod installer;
pub mod libbox;
mod manager;
mod profile;
mod service;

pub mod settings;

use service::ProxyService;
use tauri::{Manager, State};

#[tauri::command]
async fn start_proxy(
    state: tauri::State<'_, service::ProxyService<tauri::Wry>>,
    node: Option<profile::Node>,
    tun: Option<bool>,
    routing: Option<String>,
) -> Result<service::ProxyStatus, String> {
    log::info!(
        "IPC: start_proxy received tun={:?}, routing={:?}",
        tun,
        routing
    );

    state
        .start_proxy(
            node,
            tun.unwrap_or(false),
            routing.unwrap_or("rule".to_string()),
        )
        .await?;

    Ok(state.get_status())
}

#[tauri::command]
async fn stop_proxy(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<service::ProxyStatus, String> {
    service.stop_proxy(true).await;
    Ok(service.get_status())
}

#[tauri::command]
async fn import_subscription(
    url: String,
    name: Option<String>,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<String, String> {
    service.import_subscription(&url, name).await
}

#[tauri::command]
async fn get_nodes(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<Vec<crate::profile::Node>, String> {
    service.get_nodes()
}

#[tauri::command]
async fn check_ip(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<serde_json::Value, String> {
    let client_builder = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10));

    let client = if service.is_tun_mode() {
        client_builder
            .no_proxy()
            .build()
            .map_err(|e| e.to_string())?
    } else {
        let port = service
            .get_app_settings()
            .map(|s| s.mixed_port)
            .unwrap_or(2080);
        let proxy =
            reqwest::Proxy::all(format!("http://127.0.0.1:{}", port)).map_err(|e| e.to_string())?;
        client_builder
            .proxy(proxy)
            .build()
            .map_err(|e| e.to_string())?
    };

    let res = client
        .get("http://ip-api.com/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn add_node(
    node: crate::profile::Node,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.add_node(node).await
}

#[tauri::command]
async fn update_node(
    id: String,
    node: crate::profile::Node,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    // Current frontend passes ID, but update_node in service takes Node.
    // Ensure Node has the ID
    let mut n = node;
    n.id = id;
    service.update_node(n).await
}

#[tauri::command]
async fn delete_node(
    id: String,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.delete_node(&id)
}

#[tauri::command]
async fn check_node_locations(
    node_ids: Vec<String>,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.probe_nodes_location(node_ids).await
}

use installer::HelperInstaller;

#[tauri::command]
async fn install_helper(app: tauri::AppHandle) -> Result<(), String> {
    let installer = HelperInstaller::new(app);
    installer.install().map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_helper(app: tauri::AppHandle) -> Result<bool, String> {
    let installer = HelperInstaller::new(app);
    let installed = installer.is_installed();

    if !installed {
        return Ok(false);
    }

    // Binary exists, now check if it's running/responsive via IPC
    let client = helper_client::HelperClient::new();
    match client.get_version() {
        Ok(v) => {
            // Version 1.1.0+ supports reload (SIGHUP)
            Ok(v == env!("CARGO_PKG_VERSION")) // Bound to specific version for update
        }
        Err(_) => {
            // Helper installed but not responsive (crashed, stopped, or stale socket)
            // Treat as not installed so we trigger the repair flow
            Ok(false)
        }
    }
}

#[tauri::command]
async fn get_rules(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<Vec<crate::profile::Rule>, String> {
    service.get_rules()
}

#[tauri::command]
async fn save_rules(
    rules: Vec<crate::profile::Rule>,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.save_rules(rules).await
}

#[tauri::command]
async fn add_rule(
    rule: crate::profile::Rule,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.add_rule(rule).await
}

#[tauri::command]
async fn update_rule(
    rule: crate::profile::Rule,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.update_rule(rule).await
}

#[tauri::command]
async fn delete_rule(
    id: String,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.delete_rule(&id).await
}

#[tauri::command]
async fn url_test(
    node_id: String,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<u64, String> {
    service.url_test(node_id).await
}

#[tauri::command]
async fn get_app_settings(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<crate::settings::AppSettings, String> {
    service.get_app_settings()
}

#[tauri::command]
async fn save_app_settings(
    settings: crate::settings::AppSettings,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.save_app_settings(settings).await
}

#[tauri::command]
async fn get_groups(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<Vec<crate::profile::Group>, String> {
    service.get_groups()
}

#[tauri::command]
async fn save_groups(
    groups: Vec<crate::profile::Group>,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.save_groups(groups).await
}

#[tauri::command]
async fn add_group(
    group: crate::profile::Group,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.add_group(group).await
}

#[tauri::command]
async fn update_group(
    group: crate::profile::Group,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.update_group(group).await
}

#[tauri::command]
async fn delete_group(
    id: String,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.delete_group(&id).await
}

#[tauri::command]
async fn ensure_auto_group(
    service: State<'_, ProxyService<tauri::Wry>>,
    name: String,
    references: Vec<String>,
    group_type: String, // "selector" or "url-test"
) -> Result<String, String> {
    let gt = match group_type.as_str() {
        "url-test" => crate::profile::GroupType::UrlTest {
            interval: 600, // Default 10 min
            tolerance: 50,
        },
        "selector" => crate::profile::GroupType::Selector,
        _ => return Err("Invalid group type".to_string()),
    };
    service.ensure_auto_group(name, references, gt)
}

#[tauri::command]
async fn get_group_alive_nodes(
    service: State<'_, ProxyService<tauri::Wry>>,
    group_id: String,
) -> Result<Vec<service::ProxyNodeStatus>, String> {
    service.get_group_nodes(&group_id).await
}

#[tauri::command]
async fn select_group_node(
    service: State<'_, ProxyService<tauri::Wry>>,
    group_id: String,
    node_name: String,
) -> Result<(), String> {
    service.select_group_node(&group_id, &node_name).await
}

#[tauri::command]
async fn get_connections(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<service::ConnectionsResponse, String> {
    service.get_connections().await
}

#[tauri::command]
async fn close_connection(
    id: String,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.close_connection(&id).await
}

#[tauri::command]
async fn close_all_connections(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    service.close_all_connections().await
}

#[tauri::command]
async fn open_main_window(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        let minimized = window.is_minimized().unwrap_or(false);
        log::info!("[open-main] is_visible={visible} is_minimized={minimized}");
        // Same fix as Reopen: if window is already "visible" but WKWebView renderer
        // may be dead, force orderOut+orderFront to re-establish the display connection.
        #[cfg(target_os = "macos")]
        if visible && !minimized {
            log::info!("[open-main] forcing hide+show+reload to recover possibly dead WKWebView");
            let w = window.clone();
            tauri::async_runtime::spawn(async move {
                let _ = w.hide();
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                let _ = w.show();
                let _ = w.set_focus();
                force_webview_repaint(&w);
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                log::info!("[open-main] calling location.reload() to recover dead WKWebView");
                let _ = w.eval("location.reload()");
            });
            log::info!("[open-main] recovery task spawned");
            return Ok(());
        }
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        #[cfg(target_os = "macos")]
        force_webview_repaint(&window);
        log::info!("[open-main] done");
    }
    Ok(())
}

#[tauri::command]
async fn quit_app(
    _app: tauri::AppHandle,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    log::info!("Preparing to quit: Stopping proxy service...");
    // 真正等待服务停止完成 (stop_proxy(true) will join the task)
    service.stop_proxy(true).await;
    log::info!("Proxy service stopped successfully.");
    Ok(())
}

#[tauri::command]
fn final_exit(app: tauri::AppHandle) {
    log::info!("Final exit signal received. Closing process.");
    app.exit(0);
}

#[tauri::command]
fn get_build_info() -> serde_json::Value {
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "commit": env!("GIT_HASH"),
    })
}

#[tauri::command]
async fn hide_tray_window(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("tray") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn set_routing_mode_command(
    service: State<'_, ProxyService<tauri::Wry>>,
    mode: String,
) -> Result<(), String> {
    service.set_routing_mode(&mode).await
}

#[tauri::command]
async fn get_proxy_status(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<service::ProxyStatus, String> {
    Ok(service.get_status())
}

use std::sync::atomic::{AtomicI64, Ordering};
static LAST_CLICK_TIME: AtomicI64 = AtomicI64::new(0);
static LAST_HIDE_TIME: AtomicI64 = AtomicI64::new(0);
static LAST_MAIN_DEFOCUS_TIME: AtomicI64 = AtomicI64::new(0);
static LAST_REOPEN_TIME: AtomicI64 = AtomicI64::new(0);

/// Forces WKWebView to fully re-render its content on macOS.
///
/// ## Background: Why this is needed
///
/// Tauri on macOS uses WKWebView as its rendering engine, which runs in a **separate
/// process** (the "Web Content" process). When a window is hidden via `window.hide()`
/// (which calls `[NSWindow orderOut:]` under the hood) and later shown again via
/// `window.show()` (which calls `[NSWindow orderFront:]`), WKWebView does **not**
/// always automatically re-render its content. The renderer process may have had its
/// backing store (GPU texture / IOSurface) evicted while the window was off-screen.
///
/// For normal windows (with a titlebar and opaque background), this blank state is
/// hidden — the OS shows the window's last cached screenshot. But Tunnet uses
/// `transparent: true` + `decorations: false`, so the window has **no fallback
/// background at all**. A blank WKWebView in this configuration appears as a
/// completely invisible, click-through window — the user sees nothing.
///
/// This is a known, open Tauri/wry bug:
///   - <https://github.com/tauri-apps/tauri/issues/8255>  (transparent window glitch after focus change)
///   - <https://github.com/tauri-apps/tauri/issues/10306> (redraw when background color is transparent)
///
/// ## Why the resize trick works
///
/// Nudging the window size by +1 px and immediately restoring it forces the OS to
/// invalidate the entire WKWebView compositing layer and schedule a synchronous
/// relayout + repaint. This is more reliable than JS-side tricks (e.g. toggling
/// `opacity` via `eval`) because:
///   1. The resize signal comes from the **native layer**, before JS even runs.
///   2. It guarantees a full compositing cycle regardless of the renderer process state.
///   3. The 1 px change is imperceptible to the user (sub-millisecond round-trip).
#[cfg(target_os = "macos")]
fn force_webview_repaint(window: &tauri::WebviewWindow) {
    if let Ok(size) = window.outer_size() {
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
            size.width + 1,
            size.height,
        )));
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
            size.width,
            size.height,
        )));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    builder = builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin({
            #[allow(unused_mut)]
            let mut updater = tauri_plugin_updater::Builder::new();
            #[cfg(target_os = "linux")]
            {
                // Intelligent target detection for Linux usage
                // 1. AppImage Check (Standard Runtime Environment)
                if std::env::var("APPIMAGE").is_ok() {
                    // Running correctly as AppImage, rely on default behavior
                } else {
                    let arch = std::env::consts::ARCH;
                    let mut target = None;

                    // 2. Deb Detection (Debian, Ubuntu, Kali, Mint, Pop!_OS)
                    if std::path::Path::new("/etc/debian_version").exists() 
                       || std::path::Path::new("/var/lib/dpkg").exists() {
                        target = Some(format!("linux-{}-deb", arch));
                    }
                    // 3. Rpm Detection (Fedora, RHEL, CentOS, OpenSUSE)
                    else if std::path::Path::new("/etc/redhat-release").exists() 
                            || std::path::Path::new("/var/lib/rpm").exists() {
                        target = Some(format!("linux-{}-rpm", arch));
                    }
                    
                    if let Some(t) = target {
                        log::info!("Detected native package manager environment. Forcing updater target to: {}", t);
                        updater = updater.target(t);
                    } else {
                        log::warn!("Could not detect specific package manager (Deb/Rpm). Falling back to default updater behavior.");
                    }
                }
            }
            updater.build()
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))
            .on_menu_event(|app, event| {
                if event.id() == "quit" {
                    log::info!("Menu Item 'Quit' clicked. Performing emergency cleanup...");
                    let service = app.state::<ProxyService<tauri::Wry>>();
                    service.emergency_cleanup();
                    std::process::exit(0);
                }
            })
            .on_window_event(|window, event| {
                let label = window.label();
                match event {
                    tauri::WindowEvent::Focused(focused) if label == "tray" => {
                        if !*focused {
                            let now = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as i64;
                            let last_click = LAST_CLICK_TIME.load(Ordering::Relaxed);
                            if (now - last_click) > 500 {
                                let _ = window.hide();
                                LAST_HIDE_TIME.store(now, Ordering::Relaxed);
                            }
                        }
                    }
                    tauri::WindowEvent::Focused(focused) if label == "main" => {
                        #[cfg(target_os = "macos")]
                        {
                            let now = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as i64;
                            if *focused {
                                let last_defocus =
                                    LAST_MAIN_DEFOCUS_TIME.load(Ordering::Relaxed);
                                // If inactive for more than 2 minutes, force repaint both windows
                                // to recover from macOS WKWebView backing store release
                                if last_defocus > 0 && (now - last_defocus) > 120_000 {
                                    let app = window.app_handle();
                                    if let Some(main_wv) = app.get_webview_window("main") {
                                        force_webview_repaint(&main_wv);
                                    }
                                    if let Some(tray_wv) = app.get_webview_window("tray") {
                                        if tray_wv.is_visible().unwrap_or(false) {
                                            force_webview_repaint(&tray_wv);
                                        }
                                    }
                                }
                            } else {
                                LAST_MAIN_DEFOCUS_TIME.store(now, Ordering::Relaxed);
                            }
                        }
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } if label == "main" => {
                        #[cfg(not(target_os = "linux"))]
                        {
                            let _ = window.hide();
                            api.prevent_close();
                        }
                        #[cfg(target_os = "linux")]
                        {
                            let _ = window.app_handle().exit(0);
                        }
                    }
                    _ => {}
                }
            });
    }
    builder
        .setup(|app| {
            // Always enable logging: Trace in debug, Info+file in release (for diagnosing
            // hard-to-reproduce issues like the transparent window bug on macOS).
            {
                let log_builder = if cfg!(debug_assertions) {
                    tauri_plugin_log::Builder::default().level(log::LevelFilter::Trace)
                } else {
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .target(tauri_plugin_log::Target::new(
                            tauri_plugin_log::TargetKind::LogDir {
                                file_name: Some("tunnet".to_string()),
                            },
                        ))
                };
                app.handle().plugin(log_builder.build())?;
            }

            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, MenuItem, Submenu};
                let app_handle = app.handle();
                // Create application menu (App Name)
                let quit_i =
                    MenuItem::with_id(app_handle, "quit", "Quit Tunnet", true, Some("Cmd+Q"))
                        .unwrap();
                let app_menu = Submenu::with_items(app_handle, "Tunnet", true, &[&quit_i]).unwrap();

                // Create Edit menu (Critical for Copy/Paste shortcuts to work)
                let undo_i =
                    tauri::menu::PredefinedMenuItem::undo(app_handle, Some("Undo")).unwrap();
                let redo_i =
                    tauri::menu::PredefinedMenuItem::redo(app_handle, Some("Redo")).unwrap();
                let cut_i = tauri::menu::PredefinedMenuItem::cut(app_handle, Some("Cut")).unwrap();
                let copy_i =
                    tauri::menu::PredefinedMenuItem::copy(app_handle, Some("Copy")).unwrap();
                let paste_i =
                    tauri::menu::PredefinedMenuItem::paste(app_handle, Some("Paste")).unwrap();
                let select_all_i =
                    tauri::menu::PredefinedMenuItem::select_all(app_handle, Some("Select All"))
                        .unwrap();

                let edit_menu = Submenu::with_items(
                    app_handle,
                    "Edit",
                    true,
                    &[&undo_i, &redo_i, &cut_i, &copy_i, &paste_i, &select_all_i],
                )
                .unwrap();

                let menu = Menu::with_items(app_handle, &[&app_menu, &edit_menu]).unwrap();
                app_handle.set_menu(menu).unwrap();
            }

            // Explicitly set window icon for Linux to ensure it shows in the Dock/Launcher
            #[cfg(target_os = "linux")]
            {
                let icon_bytes = include_bytes!("../icons/128x128@2x.png");
                if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_icon(icon.clone());
                    }
                    if let Some(window) = app.get_webview_window("tray") {
                        let _ = window.set_icon(icon);
                    }
                }
            }

            let proxy_service = ProxyService::new(app.handle().clone());
            proxy_service.init(); // Clean up orphans and warmup cache
            app.manage(proxy_service);

            // Auto-connect hook
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let service = app_handle.state::<ProxyService<tauri::Wry>>();
                service.maybe_auto_connect().await;
            });

            // System Tray Setup
            #[cfg(desktop)]
            {
                use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};

                // Load dedicated monochromatic tray icon
                // Load dedicated monochromatic tray icon for macOS/Linux, and colored for Windows
                #[cfg(target_os = "windows")]
                let tray_icon_bytes = include_bytes!("../icons/32x32.png");
                #[cfg(not(target_os = "windows"))]
                let tray_icon_bytes = include_bytes!("../resources/tray-icon.png");
                let tray_icon = tauri::image::Image::from_bytes(tray_icon_bytes)
                    .expect("Failed to load tray icon");

                use tauri::menu::{Menu, MenuItem};
                let locale = sys_locale::get_locale().unwrap_or_else(|| "en-US".to_string());
                let quit_text = if locale.starts_with("zh") {
                    "退出"
                } else {
                    "Quit"
                };
                let quit_i = MenuItem::with_id(app.handle(), "quit", quit_text, true, None::<&str>)
                    .expect("Failed to create quit menu item");
                let menu =
                    Menu::with_items(app.handle(), &[&quit_i]).expect("Failed to create tray menu");

                use tauri::Listener; // Import Listener trait
                let _tray = TrayIconBuilder::with_id("tray")
                    .icon(tray_icon)
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        if event.id() == "quit" {
                            log::info!("Tray Menu Item 'Quit' clicked. Cleanup and exit...");
                            let service = app.state::<ProxyService<tauri::Wry>>();
                            service.emergency_cleanup();
                            std::process::exit(0);
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            position,
                            ..
                        } = event
                        {
                            let now = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as i64;
                            let last_click = LAST_CLICK_TIME.load(Ordering::Relaxed);

                            if (now - last_click) < 200 {
                                return;
                            }
                            LAST_CLICK_TIME.store(now, Ordering::Relaxed);

                            let last_hide = LAST_HIDE_TIME.load(Ordering::Relaxed);
                            if (now - last_hide) < 400 {
                                return;
                            }

                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("tray") {
                                let visible = window.is_visible().unwrap_or(false);
                                log::info!("[tray-click] tray window is_visible={visible}");
                                if visible {
                                    log::info!("[tray-click] hiding tray window");
                                    let _ = window.hide();
                                } else {
                                    if let Ok(Some(monitor)) = window.current_monitor() {
                                        // Use physical sizes for all calculations
                                        let win_size = window
                                            .outer_size()
                                            .unwrap_or(tauri::PhysicalSize::new(320, 480));
                                        let win_w = win_size.width as i32;
                                        let win_h = win_size.height as i32;

                                        let workarea = monitor.work_area();
                                        let workarea_size = workarea.size;
                                        let workarea_pos = workarea.position;

                                        let wa_w = workarea_size.width as i32;
                                        let wa_h = workarea_size.height as i32;
                                        let wa_x = workarea_pos.x;
                                        let wa_y = workarea_pos.y;

                                        let mut x = (position.x as i32) - (win_w / 2);
                                        let mut y = position.y as i32;

                                        // Vertical Adjustment (Flip if overflow workarea bottom)
                                        if y + win_h > wa_y + wa_h {
                                            y = position.y as i32 - win_h - 36;
                                        }

                                        // Horizontal Adjustment (Clamp to workarea edges)
                                        if x + win_w > wa_x + wa_w {
                                            x = wa_x + wa_w - win_w;
                                        }
                                        if x < wa_x {
                                            x = wa_x;
                                        }

                                        let _ = window.set_position(tauri::Position::Physical(
                                            tauri::PhysicalPosition { x, y },
                                        ));
                                    }

                                    log::info!("[tray-click] showing tray window");
                                    let show_result = window.show();
                                    log::info!("[tray-click] show() result: {show_result:?}");
                                    let _ = window.set_focus();
                                    let _ = window.set_always_on_top(true);
                                    #[cfg(target_os = "macos")]
                                    force_webview_repaint(&window);

                                }
                            }
                        }
                    })
                    .build(app)?;

                // Listen for language changes to update tray menu
                let handle = app.handle().clone();
                app.listen("language-changed", move |event| {
                    if let Ok(lang) = serde_json::from_str::<String>(event.payload()) {
                        let quit_text = if lang == "zh-CN" { "退出" } else { "Quit" };
                        if let Ok(quit_i) =
                            MenuItem::with_id(&handle, "quit", quit_text, true, None::<&str>)
                        {
                            if let Ok(menu) = Menu::with_items(&handle, &[&quit_i]) {
                                if let Some(tray) = handle.tray_by_id("tray") {
                                    let _ = tray.set_menu(Some(menu));
                                }
                            }
                        }
                    }
                });

                #[cfg(target_os = "macos")]
                let _ = _tray.set_icon_as_template(true);
            }

            // Handle Start Minimized
            #[cfg(desktop)]
            {
                let service = app.state::<ProxyService<tauri::Wry>>();
                if let Ok(settings) = service.get_app_settings() {
                    if settings.start_minimized {
                        if let Some(window) = app.get_webview_window("main") {
                            #[cfg(target_os = "linux")]
                            let _ = window.minimize();
                            #[cfg(not(target_os = "linux"))]
                            let _ = window.hide();
                        }
                    }

                    if settings.auto_update {
                        let handle = app.handle().clone();
                        tauri::async_runtime::spawn(async move {
                            use tauri::Emitter;
                            use tauri_plugin_updater::UpdaterExt;
                            if let Ok(Some(update)) = handle.updater().unwrap().check().await {
                                log::info!("New version available: {}", update.version);
                                // For now we just log it, or we could emit an event to the frontend
                                // to show a notification. But the user specifically asked for
                                // auto-update functionality.
                                let _ = handle.emit("update-available", update.version);
                            }
                        });
                    }
                }
            }

            // Allow tray window to focus on setup? No, it's hidden by default.

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_proxy,
            stop_proxy,
            import_subscription,
            get_nodes,
            check_ip,
            add_node,
            update_node,
            delete_node,
            install_helper,
            check_helper,
            get_profiles,
            delete_profile,
            update_subscription_profile,
            check_node_locations,
            get_rules,
            save_rules,
            add_rule,
            update_rule,
            delete_rule,
            url_test,
            get_app_settings,
            save_app_settings,
            // Group Commands
            ensure_auto_group,
            get_groups,
            save_groups,
            add_group,
            update_group,
            delete_group,
            get_group_alive_nodes,
            select_group_node,
            // New commands
            open_main_window,
            quit_app,
            hide_tray_window,
            set_routing_mode_command,
            get_proxy_status,
            final_exit,
            get_build_info,
            edit_profile,
            check_node_pings,
            get_group_status,
            refresh_geodata,
            restart_app,
            get_node_link,
            export_node_content,
            export_profile_content,
            export_group_content,
            export_all_nodes,
            export_singbox_config,
            export_tunnet_backup,
            import_tunnet_backup,
            decode_qr,
            get_connections,
            close_connection,
            close_all_connections
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { api, .. } => {
                    api.prevent_exit();
                    log::info!("Exit requested (System signal), performing emergency cleanup...");

                    let app = _app_handle.clone();
                    let service = app.state::<ProxyService<tauri::Wry>>();
                    service.emergency_cleanup();

                    log::info!("Exiting process now.");
                    std::process::exit(0);
                }
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    // Tauri fires Reopen twice per Dock-icon click on macOS (known bug).
                    // Debounce to 500 ms so we only act once.
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64;
                    let last = LAST_REOPEN_TIME.load(Ordering::Relaxed);
                    if (now - last) < 500 {
                        return;
                    }
                    LAST_REOPEN_TIME.store(now, Ordering::Relaxed);

                    log::info!("[reopen] Dock icon clicked, attempting to show main window");
                    if let Some(window) = _app_handle.get_webview_window("main") {
                        let visible = window.is_visible().unwrap_or(false);
                        let minimized = window.is_minimized().unwrap_or(false);
                        log::info!("[reopen] main window is_visible={visible} is_minimized={minimized}");

                        // Diagnostic confirmed: window reports is_visible=true / is_minimized=false
                        // yet is blank/transparent. This means the WKWebView renderer process was
                        // killed by macOS (memory pressure or App Nap) while the NSWindow itself
                        // stayed alive. In this state show() is a no-op and resize tricks have no
                        // effect on a dead renderer process.
                        //
                        // Fix: force a full orderOut + orderFront cycle. Calling hide() first
                        // (orderOut) tears down the current display connection, then show()
                        // (orderFront/makeKeyAndOrderFront) causes macOS to establish a fresh one,
                        // which restarts or re-attaches the WKWebView renderer process.
                        if visible && !minimized {
                            log::info!("[reopen] window visible but possibly blank — forcing hide+show+reload");
                            // hide+show alone is not enough: the WKWebView renderer process
                            // may be dead and orderOut+orderFront does not restart it.
                            // Spawn an async task so we can insert a small delay between
                            // hide and show (giving macOS time to tear down the old context)
                            // then call location.reload() to force the renderer to restart.
                            // The proxy backend is unaffected; only the UI resets.
                            let w = window.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = w.hide();
                                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                                let _ = w.show();
                                let _ = w.set_focus();
                                force_webview_repaint(&w);
                                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                                log::info!("[reopen] calling location.reload() to recover dead WKWebView");
                                let _ = w.eval("location.reload()");
                            });
                            log::info!("[reopen] recovery task spawned");
                            return;
                        }

                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                        force_webview_repaint(&window);
                        log::info!("[reopen] show/unminimize/focus done");
                    } else {
                        log::warn!("[reopen] could not get main webview window");
                    }
                }
                _ => {}
            }
        });
}

#[tauri::command]
async fn get_profiles(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<Vec<crate::profile::Profile>, String> {
    service.get_profiles()
}

#[tauri::command]
async fn delete_profile(
    service: State<'_, ProxyService<tauri::Wry>>,
    id: String,
) -> Result<(), String> {
    service.delete_profile(&id).await
}

#[tauri::command]
async fn edit_profile(
    service: State<'_, ProxyService<tauri::Wry>>,
    id: String,
    name: String,
    url: Option<String>,
    update_interval: Option<u64>,
    clear_interval: Option<bool>,
) -> Result<(), String> {
    service.edit_profile(
        &id,
        &name,
        url,
        update_interval,
        clear_interval.unwrap_or(false),
    )
}

#[tauri::command]
async fn update_subscription_profile(
    service: State<'_, ProxyService<tauri::Wry>>,
    id: String,
) -> Result<Vec<String>, String> {
    service.update_subscription_profile(&id).await
}

#[tauri::command]
async fn check_node_pings(
    service: State<'_, ProxyService<tauri::Wry>>,
    node_ids: Vec<String>,
) -> Result<(), String> {
    service.probe_nodes_latency(node_ids).await
}

#[tauri::command]
async fn get_group_status(
    service: State<'_, ProxyService<tauri::Wry>>,
    group_id: String,
) -> Result<String, String> {
    service.get_group_status(&group_id).await
}

#[tauri::command]
async fn refresh_geodata(service: State<'_, ProxyService<tauri::Wry>>) -> Result<(), String> {
    service.refresh_geodata().await
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
async fn get_node_link(
    service: State<'_, ProxyService<tauri::Wry>>,
    id: String,
) -> Result<String, String> {
    service.export_node_link(id)
}

#[tauri::command]
async fn export_profile_content(
    service: State<'_, ProxyService<tauri::Wry>>,
    id: String,
    format: String,
) -> Result<String, String> {
    service.export_profile_content(id, format)
}

#[tauri::command]
async fn export_group_content(
    service: State<'_, ProxyService<tauri::Wry>>,
    id: String,
    format: String,
) -> Result<String, String> {
    service.export_group_content(id, format)
}

#[tauri::command]
async fn export_node_content(
    service: State<'_, ProxyService<tauri::Wry>>,
    id: String,
    format: String,
) -> Result<String, String> {
    service.export_node_content(id, format)
}

#[tauri::command]
async fn export_all_nodes(
    service: State<'_, ProxyService<tauri::Wry>>,
    format: String,
) -> Result<String, String> {
    service.export_all_nodes(format)
}

#[tauri::command]
async fn export_singbox_config(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<String, String> {
    service.export_singbox_config()
}

#[tauri::command]
async fn export_tunnet_backup(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<String, String> {
    service.export_tunnet_backup()
}

#[tauri::command]
async fn import_tunnet_backup(
    service: State<'_, ProxyService<tauri::Wry>>,
    json: String,
) -> Result<(), String> {
    service.import_tunnet_backup(json).await
}

#[tauri::command]
async fn decode_qr(
    service: State<'_, ProxyService<tauri::Wry>>,
    path: String,
) -> Result<String, String> {
    service.decode_qr(&path)
}

pub mod parsing_test_mod;
