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
            Ok(v == "2.0.14") // Bound to specific version for update
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
async fn open_main_window(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn quit_app(
    app: tauri::AppHandle,
    service: State<'_, ProxyService<tauri::Wry>>,
) -> Result<(), String> {
    log::info!("Quitting application...");
    service.stop_proxy(false).await;
    app.exit(0);
    // Since we prevent exit in the run loop, we might need to force it if app.exit(0) isn't enough
    // But usually app.exit(0) should be handled. If not, std::process::exit(0) works.
    std::process::exit(0);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    builder = builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init());

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
                            }
                        }
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } if label == "main" => {
                        let _ = window.hide();
                        api.prevent_close();
                    }
                    _ => {}
                }
            });
    }
    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Trace)
                        .build(),
                )?;
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

            let proxy_service = ProxyService::new(app.handle().clone());
            proxy_service.init(); // Clean up orphans and warmup cache
            app.manage(proxy_service);

            // System Tray Setup
            #[cfg(desktop)]
            {
                use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};

                // Load dedicated monochromatic tray icon
                let tray_icon_bytes = include_bytes!("../resources/tray-icon.png");
                let tray_icon = tauri::image::Image::from_bytes(tray_icon_bytes)
                    .expect("Failed to load tray icon");

                let tray = TrayIconBuilder::new()
                    .icon(tray_icon)
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
                                            y = position.y as i32 - win_h - 12;
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

                                    let _ = window.show();
                                    let _ = window.set_focus(); // Re-enabled for blur detection
                                    let _ = window.set_always_on_top(true);
                                }
                            }
                        }
                    })
                    .build(app)?;

                #[cfg(target_os = "macos")]
                let _ = tray.set_icon_as_template(true);
            }

            // Handle Start Minimized
            #[cfg(desktop)]
            {
                let service = app.state::<ProxyService<tauri::Wry>>();
                if let Ok(settings) = service.get_app_settings() {
                    if settings.start_minimized {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
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
            edit_profile,
            check_node_pings,
            get_group_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
                log::info!("Exit requested (System signal), performing emergency cleanup...");

                let app = _app_handle.clone();
                let service = app.state::<ProxyService<tauri::Wry>>();
                service.emergency_cleanup();

                log::info!("Exiting process now.");
                std::process::exit(0);
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

pub mod parsing_test_mod;
