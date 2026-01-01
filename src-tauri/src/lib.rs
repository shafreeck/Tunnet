mod config;
mod helper_client;
mod installer;
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
) -> Result<(), String> {
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
        .await
}

#[tauri::command]
async fn stop_proxy(service: State<'_, ProxyService<tauri::Wry>>) -> Result<(), String> {
    service.stop_proxy();
    Ok(())
}

#[tauri::command]
async fn import_subscription(
    url: String,
    name: Option<String>,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
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
        let proxy = reqwest::Proxy::all("http://127.0.0.1:2080").map_err(|e| e.to_string())?;
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
    service.add_node(node)
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
    service.update_node(n)
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
    service.probe_nodes_connectivity(node_ids).await
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
            Ok(v == "1.1.0") // For now exact match, or use semver logic
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
async fn check_singbox_update(
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<Option<String>, String> {
    service.check_core_update().await
}

#[tauri::command]
async fn update_singbox_core(service: State<'_, ProxyService<tauri::Wry>>) -> Result<(), String> {
    let was_running = service.is_proxy_running();
    if was_running {
        service.stop_proxy();
    }

    let result = service.update_core().await;

    // Users must restart manually or implementing restart logic is complex here
    // But since we replaced binary, next start will pick it up.
    result
}

#[tauri::command]
async fn open_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn hide_tray_window(app: tauri::AppHandle) -> Result<(), String> {
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

use std::sync::atomic::{AtomicI64, Ordering};
static LAST_CLICK_TIME: AtomicI64 = AtomicI64::new(0);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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
                        }
                    }
                }
                tauri::WindowEvent::CloseRequested { api, .. } if label == "main" => {
                    let _ = window.hide();
                    api.prevent_close();
                }
                _ => {}
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let proxy_service = ProxyService::new(app.handle().clone());
            app.manage(proxy_service);

            // System Tray Setup
            use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .show_menu_on_left_click(false)
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

                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("tray") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                // Calculate position
                                let _ = window.set_position(tauri::Position::Physical(
                                    tauri::PhysicalPosition {
                                        x: (position.x as i32) - 160,
                                        y: (position.y as i32) + 0,
                                    },
                                ));

                                let _ = window.show();
                                let _ = window.set_focus(); // Re-enabled for blur detection
                                let _ = window.set_always_on_top(true);
                            }
                        }
                    }
                })
                .build(app)?;

            // Handle Start Minimized
            let service = app.state::<ProxyService<tauri::Wry>>();
            if let Ok(settings) = service.get_app_settings() {
                if settings.start_minimized {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
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
            check_singbox_update,
            update_singbox_core,
            // New commands
            open_main_window,
            quit_app,
            hide_tray_window,
            set_routing_mode_command
        ]);
    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
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
    service.delete_profile(&id)
}

#[tauri::command]
async fn update_subscription_profile(
    service: State<'_, ProxyService<tauri::Wry>>,
    id: String,
) -> Result<(), String> {
    service.update_subscription_profile(&id).await
}
pub mod parsing_test_mod;
