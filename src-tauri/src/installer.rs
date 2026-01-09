use std::error::Error;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

const HELPER_LABEL: &str = "run.tunnet.app.helper";
const HELPER_BIN_NAME: &str = "tunnet-helper";

pub struct HelperInstaller {
    app_handle: AppHandle,
}

impl HelperInstaller {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    pub fn is_installed(&self) -> bool {
        // Simple check: does the binary exist?
        // Better check: try to connect to socket or check launchctl
        PathBuf::from("/Library/PrivilegedHelperTools")
            .join(HELPER_LABEL)
            .exists()
    }

    pub fn install(&self) -> Result<(), Box<dyn Error>> {
        // 1. Find binary path (handle dev vs production)
        // Note: resources are bundled into a 'resources' subdirectory due to tauri.conf.json structure
        let mut resource_path = self
            .app_handle
            .path()
            .resource_dir()?
            .join("resources")
            .join(HELPER_BIN_NAME);

        if cfg!(debug_assertions) {
            // In dev mode, the binary might be in target/debug
            if let Ok(exe_path) = std::env::current_exe() {
                let debug_path = exe_path.parent().unwrap().join(HELPER_BIN_NAME);
                if debug_path.exists() {
                    println!("Found helper in debug path: {:?}", debug_path);
                    resource_path = debug_path;
                }
            }
        }

        if !resource_path.exists() {
            return Err(format!("Helper binary not found at {:?}", resource_path).into());
        }

        println!("Installing helper from: {:?}", resource_path);

        // 2. Prepare Plist Content (same as before)
        let plist_content = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Library/PrivilegedHelperTools/{}</string>
    </array>
    <key>MachServices</key>
    <dict>
        <key>{}</key>
        <true/>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
"#,
            HELPER_LABEL, HELPER_LABEL, HELPER_LABEL
        );

        let temp_plist_path = std::env::temp_dir().join(format!("{}.plist", HELPER_LABEL));
        fs::write(&temp_plist_path, plist_content)?;

        // 3. Construct install script with UNLOAD first to ensure restart
        let cmd_unload = format!(
            "launchctl unload '/Library/LaunchDaemons/{}.plist' || true",
            HELPER_LABEL
        );
        let cmd_rm_bin = format!("rm -f '/Library/PrivilegedHelperTools/{}'", HELPER_LABEL);
        let cmd_cp_bin = format!(
            "cp '{}' '/Library/PrivilegedHelperTools/{}'",
            resource_path.to_string_lossy(),
            HELPER_LABEL
        );
        let cmd_chown_bin = format!(
            "chown root:wheel '/Library/PrivilegedHelperTools/{}'",
            HELPER_LABEL
        );
        let cmd_chmod_bin = format!(
            "chmod 755 '/Library/PrivilegedHelperTools/{}'",
            HELPER_LABEL
        );
        let cmd_cp_plist = format!(
            "cp '{}' '/Library/LaunchDaemons/{}.plist'",
            temp_plist_path.to_string_lossy(),
            HELPER_LABEL
        );
        let cmd_chown_plist = format!(
            "chown root:wheel '/Library/LaunchDaemons/{}.plist'",
            HELPER_LABEL
        );
        let cmd_load = format!(
            "launchctl load -w '/Library/LaunchDaemons/{}.plist'",
            HELPER_LABEL
        );

        let script = format!(
            "{} && {} && {} && {} && {} && {} && {} && {}",
            cmd_unload,
            cmd_rm_bin,
            cmd_cp_bin,
            cmd_chown_bin,
            cmd_chmod_bin,
            cmd_cp_plist,
            cmd_chown_plist,
            cmd_load
        );

        let script_escaped = script.replace("\\", "\\\\").replace("\"", "\\\"");
        let apple_script = format!(
            "do shell script \"{}\" with prompt \"Tunnet needs to update the helper tool for scientific routing.\" with administrator privileges",
            script_escaped
        );

        let output = Command::new("osascript")
            .arg("-e")
            .arg(apple_script)
            .output()?;

        if !output.status.success() {
            return Err(format!(
                "Installation failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )
            .into());
        }

        Ok(())
    }
}
