use flate2::read::GzDecoder;
use futures_util::StreamExt;
use log::{info, warn};
use reqwest::Client;

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tar::Archive;
use tauri::{AppHandle, Manager, Runtime};

const SING_BOX_RELEASE_URL: &str = "https://github.com/SagerNet/sing-box/releases/download/v1.12.14/sing-box-1.12.14-darwin-arm64.tar.gz";
const SING_BOX_FILENAME: &str = "sing-box";

pub struct CoreManager<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> CoreManager<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }

    pub fn get_core_path(&self) -> PathBuf {
        self.app
            .path()
            .app_local_data_dir()
            .expect("failed to resolve app local data dir")
            .join("bin")
            .join(SING_BOX_FILENAME)
    }

    pub async fn check_and_download(&self) -> Result<(), String> {
        let core_path = self.get_core_path();

        let mut should_extract = true;

        if core_path.exists() {
            // Check version
            let output = std::process::Command::new(&core_path)
                .arg("version")
                .output();

            if let Ok(out) = output {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if stdout.contains("version 1.12.14") {
                    info!("Sing-box version 1.12.14 is already installed.");
                    should_extract = false;
                } else {
                    warn!("Detected old sing-box version, upgrading to 1.12.14...");
                }
            }
        }

        if !should_extract {
            return Ok(());
        }

        // 1. Try to extract from resources (Development/Production bundling)
        match self.extract_from_resources("sing-box", &core_path) {
            Ok(_) => {
                info!("Extracted sing-box from resources");
                // Ensure executable
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mut perms = fs::metadata(&core_path)
                        .map_err(|e| e.to_string())?
                        .permissions();
                    perms.set_mode(0o755);
                    fs::set_permissions(&core_path, perms).map_err(|e| e.to_string())?;
                }
                Ok(())
            }
            Err(e) => {
                warn!(
                    "Failed to extract sing-box from resources: {}. Falling back to download.",
                    e
                );
                self.download_core().await
            }
        }
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

    async fn download_generic_file(&self, url: &str, path: &Path) -> Result<(), String> {
        let client = Client::new();
        let res = client.get(url).send().await.map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            return Err(format!("Download failed: {}", res.status()));
        }

        let mut stream = res.bytes_stream();
        let mut file = fs::File::create(path).map_err(|e| e.to_string())?;

        while let Some(item) = stream.next().await {
            let chunk = item.map_err(|e| e.to_string())?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    async fn download_core(&self) -> Result<(), String> {
        let client = Client::new();
        let res = client
            .get(SING_BOX_RELEASE_URL)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            return Err(format!("Download failed: {}", res.status()));
        }

        let _total_size = res.content_length();
        let mut stream = res.bytes_stream();

        // Prepare temp file
        let app_local_data = self
            .app
            .path()
            .app_local_data_dir()
            .map_err(|e| e.to_string())?;
        let bin_dir = app_local_data.join("bin");
        if !bin_dir.exists() {
            fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
        }

        let temp_tar_path = bin_dir.join("sing-box.tar.gz");
        let mut file = fs::File::create(&temp_tar_path).map_err(|e| e.to_string())?;

        while let Some(item) = stream.next().await {
            let chunk = item.map_err(|e| e.to_string())?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
        }

        // Extract
        self.extract_core(&temp_tar_path, &bin_dir)?;

        // Startup cleanup
        let _ = fs::remove_file(temp_tar_path);

        Ok(())
    }

    fn extract_core(&self, tar_path: &Path, target_dir: &Path) -> Result<(), String> {
        let tar_gz = fs::File::open(tar_path).map_err(|e| e.to_string())?;
        let tar = GzDecoder::new(tar_gz);
        let mut archive = Archive::new(tar);

        for entry in archive.entries().map_err(|e| e.to_string())? {
            let mut entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path().map_err(|e| e.to_string())?;

            // Flatten directory structure: we just want the binary
            if let Some(name) = path.file_name() {
                if name == SING_BOX_FILENAME {
                    let mut dest_file =
                        fs::File::create(target_dir.join(name)).map_err(|e| e.to_string())?;
                    std::io::copy(&mut entry, &mut dest_file).map_err(|e| e.to_string())?;

                    // Set executable permission
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let mut perms = dest_file
                            .metadata()
                            .map_err(|e| e.to_string())?
                            .permissions();
                        perms.set_mode(0o755);
                        dest_file
                            .set_permissions(perms)
                            .map_err(|e| e.to_string())?;
                    }
                    return Ok(());
                }
            }
        }

        Err("sing-box binary not found in archive".to_string())
    }

    pub async fn fetch_subscription(
        &self,
        url: &str,
        name: Option<String>,
    ) -> Result<crate::profile::Profile, String> {
        if url.starts_with("http://") || url.starts_with("https://") {
            let client = Client::new();
            let res = client
                .get(url)
                .header("User-Agent", "Tunnet/1.0")
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
}
