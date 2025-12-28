mod config;
mod helper_client;
mod installer;
mod manager;
mod profile;
mod service;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
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
            delete_rule
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
