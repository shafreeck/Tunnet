// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    {
        // Get the path to the executable
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                // Tauri bundles "resources/bin/*" into a "resources/bin" directory next to the executable.
                // We need to add this directory to the DLL search path so that:
                // 1. Rust can finding libbox.dll (via SetDllDirectory - standard Windows API)
                // 2. Go runtime (inside libbox) can find wintun.dll (via PATH - standard for subprocesses/third-party libs)
                let bin_dir = exe_dir.join("resources").join("bin");

                if bin_dir.exists() {
                    // Update PATH environment variable for this process
                    let path_key = "PATH";
                    if let Ok(current_path) = std::env::var(path_key) {
                        let new_path = format!("{};{}", bin_dir.display(), current_path);
                        std::env::set_var(path_key, new_path);
                    } else {
                        std::env::set_var(path_key, bin_dir.as_os_str());
                    }

                    // Set DLL directory for the main process loader
                    unsafe {
                        use std::os::windows::ffi::OsStrExt;
                        #[link(name = "kernel32")]
                        extern "system" {
                            fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
                        }
                        let mut path_u16: Vec<u16> = bin_dir.as_os_str().encode_wide().collect();
                        path_u16.push(0);
                        SetDllDirectoryW(path_u16.as_ptr());
                    }
                }
            }
        }
    }
    app_lib::run();
}
