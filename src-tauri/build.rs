use std::env;
use std::path::Path;
use std::process::Command;

fn main() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "macos" {
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let libbox_dir = Path::new(&manifest_dir).join("../core_library/libbox-c-shared");

        // Only rebuild if Go files change
        println!(
            "cargo:rerun-if-changed={}",
            libbox_dir.join("main.go").display()
        );
        println!(
            "cargo:rerun-if-changed={}",
            libbox_dir.join("go.mod").display()
        );

        // Build Go library as static archive (safer for privileged helpers)
        let status = Command::new("go")
            .current_dir(&libbox_dir)
            .args(&[
                "build",
                "-tags",
                "with_clash_api,with_gvisor,with_quic,with_wireguard,with_utls",
                "-buildmode=c-archive",
                "-o",
                "libbox.a",
                "main.go",
            ])
            .env("CGO_ENABLED", "1")
            .status()
            .expect("Failed to execute go build");

        if !status.success() {
            panic!("Go build failed");
        }

        // Link instructions
        println!("cargo:rustc-link-search=native={}", libbox_dir.display());
        println!("cargo:rustc-link-lib=static=box");

        // Link system frameworks required by Go / Sing-box on macOS
        // Link system frameworks using explicit args to ensure they are passed to linker
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg=CoreFoundation");
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg=Security");
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg=SystemConfiguration");

        println!("cargo:rustc-link-arg=-lresolv");
    } else if target_os == "windows" {
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let libbox_dir = Path::new(&manifest_dir).join("../core_library/libbox-c-shared");

        // Only rebuild if Go files change
        println!(
            "cargo:rerun-if-changed={}",
            libbox_dir.join("main.go").display()
        );

        // Build Go library as static archive
        let status = Command::new("go")
            .current_dir(&libbox_dir)
            .args(&[
                "build",
                "-tags",
                "with_clash_api,with_gvisor,with_quic,with_wireguard,with_utls,with_wintun",
                "-buildmode=c-archive",
                "-o",
                "libbox.a",
                "main.go",
            ])
            .env("CGO_ENABLED", "1")
            .status()
            .expect("Failed to execute go build");

        if !status.success() {
            panic!("Go build failed");
        }

        // Link instructions
        println!("cargo:rustc-link-search=native={}", libbox_dir.display());
        println!("cargo:rustc-link-lib=static=box");

        // Link Windows system libraries required by Go / Sing-box
        println!("cargo:rustc-link-lib=ws2_32");
        println!("cargo:rustc-link-lib=iphlpapi");
        println!("cargo:rustc-link-lib=dnsapi");
        println!("cargo:rustc-link-lib=ntdll");
        println!("cargo:rustc-link-lib=userenv");
        println!("cargo:rustc-link-lib=crypt32");
    }

    tauri_build::build()
}
