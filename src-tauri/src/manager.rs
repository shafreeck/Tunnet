use log::info;
use reqwest::Client;

use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const SETTINGS_FILENAME: &str = "settings.json";

pub struct CoreManager<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> CoreManager<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }

    pub async fn ensure_databases(&self) -> Result<(), String> {
        let app_local_data = self
            .app
            .path()
            .app_local_data_dir()
            .map_err(|e| e.to_string())?;

        let geoip_path = app_local_data.join("geoip-cn.srs");
        let geosite_path = app_local_data.join("geosite-cn.srs");

        // Check GeoIP
        if !geoip_path.exists() {
            if self
                .extract_from_resources("geoip-cn.srs", &geoip_path)
                .is_err()
            {
                info!("GeoIP SRS missing and not in resources, skipping download (bundled only mode)...");
            }
        }

        // Check GeoSite
        if !geosite_path.exists() {
            if self
                .extract_from_resources("geosite-cn.srs", &geosite_path)
                .is_err()
            {
                info!("GeoSite SRS missing and not in resources, skipping download (bundled only mode)...");
            }
        }

        Ok(())
    }

    fn extract_from_resources(&self, name: &str, dest: &Path) -> Result<(), String> {
        let resource_path = self
            .app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("resources")
            .join(name);

        if !resource_path.exists() {
            return Err(format!(
                "Resource {} not found at {:?}",
                name, resource_path
            ));
        }

        if let Some(parent) = dest.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }

        fs::copy(&resource_path, dest).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn fetch_subscription(
        &self,
        url: &str,
        name: Option<String>,
    ) -> Result<crate::profile::Profile, String> {
        let url = url.trim();
        if url.starts_with("http://") || url.starts_with("https://") {
            let client = Client::new();
            // Use sing-box User-Agent to get full node list and subscription info
            let res = client
                .get(url)
                .header("User-Agent", "sing-box")
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let mut profile = crate::profile::Profile {
                id: uuid::Uuid::new_v4().to_string(),
                name: name.unwrap_or("New Subscription".to_string()),
                url: Some(url.to_string()),
                nodes: vec![],
                upload: None,
                download: None,
                total: None,
                expire: None,
            };

            // Parse Subscription-Userinfo
            if let Some(user_info_val) = res.headers().get("subscription-userinfo") {
                if let Ok(user_info_str) = user_info_val.to_str() {
                    for part in user_info_str.split(';') {
                        let part = part.trim();
                        if let Some((k, v)) = part.split_once('=') {
                            if let Ok(val) = v.parse::<u64>() {
                                match k {
                                    "upload" => profile.upload = Some(val),
                                    "download" => profile.download = Some(val),
                                    "total" => profile.total = Some(val),
                                    "expire" => profile.expire = Some(val),
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }

            // Extract name from Content-Disposition if not provided or default
            if profile.name == "New Subscription" {
                if let Some(cd_val) = res.headers().get("content-disposition") {
                    if let Ok(cd_str) = cd_val.to_str() {
                        // Look for filename*=UTF-8''... or filename="..."
                        if let Some(idx) = cd_str.find("filename*=") {
                            let part = &cd_str[idx + 10..];
                            if let Some(val) = part.split(';').next() {
                                let val = val.trim().trim_matches('"');
                                if val.to_uppercase().starts_with("UTF-8''") {
                                    let encoded = &val[7..];
                                    if let Ok(decoded) = urlencoding::decode(encoded) {
                                        profile.name = decoded.to_string();
                                    }
                                }
                            }
                        } else if let Some(idx) = cd_str.find("filename=") {
                            let part = &cd_str[idx + 9..];
                            if let Some(val) = part.split(';').next() {
                                let val = val.trim().trim_matches('"');
                                if let Ok(decoded) = urlencoding::decode(val) {
                                    profile.name = decoded.to_string();
                                }
                            }
                        }
                    }
                }
            }

            let text = res.text().await.map_err(|e| e.to_string())?;
            profile.nodes = crate::profile::parser::parse_subscription(&text);
            Ok(profile)
        } else {
            // Treat as raw content/link (e.g. vmess://, ss://, or base64)
            let nodes = crate::profile::parser::parse_subscription(url);
            Ok(crate::profile::Profile {
                id: uuid::Uuid::new_v4().to_string(),
                name: name.unwrap_or("Local Import".to_string()),
                url: None, // Raw import usually has no update URL
                nodes,
                upload: None,
                download: None,
                total: None,
                expire: None,
            })
        }
    }

    pub fn get_profiles_path(&self) -> PathBuf {
        self.app
            .path()
            .app_local_data_dir()
            .expect("failed to resolve app local data dir")
            .join("profiles_v2.json") // v2 to avoid conflict/ensure clean slate
    }

    pub fn save_profiles(&self, profiles: &[crate::profile::Profile]) -> Result<(), String> {
        let path = self.get_profiles_path();
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        let json = serde_json::to_string_pretty(profiles).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load_profiles(&self) -> Result<Vec<crate::profile::Profile>, String> {
        let path = self.get_profiles_path();
        if !path.exists() {
            return Ok(vec![]);
        }
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let profiles: Vec<crate::profile::Profile> =
            serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(profiles)
    }

    pub fn get_rules_path(&self) -> PathBuf {
        self.app
            .path()
            .app_local_data_dir()
            .expect("failed to resolve app local data dir")
            .join("rules.json")
    }

    pub fn save_rules(&self, rules: &[crate::profile::Rule]) -> Result<(), String> {
        let path = self.get_rules_path();
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        let json = serde_json::to_string_pretty(rules).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load_rules(&self) -> Result<Vec<crate::profile::Rule>, String> {
        let path = self.get_rules_path();
        if !path.exists() {
            return Ok(vec![]);
        }
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let rules: Vec<crate::profile::Rule> =
            serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(rules)
    }

    pub fn get_groups_path(&self) -> PathBuf {
        self.app
            .path()
            .app_local_data_dir()
            .expect("failed to resolve app local data dir")
            .join("groups.json")
    }

    pub fn save_groups(&self, groups: &[crate::profile::Group]) -> Result<(), String> {
        let path = self.get_groups_path();
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        let json = serde_json::to_string_pretty(groups).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load_groups(&self) -> Result<Vec<crate::profile::Group>, String> {
        let path = self.get_groups_path();
        if !path.exists() {
            return Ok(vec![]);
        }
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let groups: Vec<crate::profile::Group> =
            serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(groups)
    }

    pub fn get_settings_path(&self) -> PathBuf {
        self.app
            .path()
            .app_local_data_dir()
            .expect("failed to resolve app local data dir")
            .join(SETTINGS_FILENAME)
    }

    pub fn save_settings(&self, settings: &crate::settings::AppSettings) -> Result<(), String> {
        let path = self.get_settings_path();
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load_settings(&self) -> Result<crate::settings::AppSettings, String> {
        let path = self.get_settings_path();
        if !path.exists() {
            return Ok(crate::settings::AppSettings::default());
        }
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let settings: crate::settings::AppSettings =
            serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(settings)
    }
}
