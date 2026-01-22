// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    unsafe {
        use std::os::windows::ffi::OsStrExt;

        #[link(name = "kernel32")]
        extern "system" {
            fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
        }

        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                // Tauri bundles resources in a 'resources/bin' subdirectory next to the executable
                let bin_dir = exe_dir.join("resources").join("bin");
                if bin_dir.exists() {
                    let mut path_u16: Vec<u16> = bin_dir.as_os_str().encode_wide().collect();
                    path_u16.push(0); // null terminator
                    SetDllDirectoryW(path_u16.as_ptr());
                }
            }
        }
    }
    app_lib::run();
}
