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
    } else if target_os == "ios" {
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let libbox_dir = Path::new(&manifest_dir).join("../core_library/libbox-c-shared");

        // Build Go library for iOS
        let target_triple = env::var("TARGET").unwrap_or_default();
        let is_sim = target_triple.contains("sim") || target_triple.contains("x86_64");

        println!(
            "cargo:warning=Building libbox for iOS target: {}, is_sim: {}",
            target_triple, is_sim
        );

        let mut cmd = Command::new("go");
        cmd.current_dir(&libbox_dir)
            .args(&[
                "build",
                "-tags",
                "with_clash_api,with_gvisor,with_quic,with_wireguard,with_utls",
                "-buildmode=c-archive",
                "-o",
                "libbox_ios.a",
                "main.go",
            ])
            .env("CGO_ENABLED", "1")
            .env("GOOS", "ios");

        if is_sim {
            if target_triple.starts_with("aarch64") {
                cmd.env("GOARCH", "arm64")
                    .env("CGO_CFLAGS", "-target arm64-apple-ios14.0-simulator");
            } else {
                cmd.env("GOARCH", "amd64");
            }
        } else {
            cmd.env("GOARCH", "arm64");
        }

        let status = cmd.status().expect("Failed to execute go build for iOS");

        if !status.success() {
            panic!("Go build for iOS failed");
        }

        // Link instructions
        println!("cargo:rustc-link-search=native={}", libbox_dir.display());
        println!("cargo:rustc-link-lib=static=box_ios");

        // iOS Frameworks (Go requirements)
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg=CoreFoundation");
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg=Security");
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg=SystemConfiguration");
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg=Network");
        println!("cargo:rustc-link-arg=-lresolv");
    } else if target_os == "android" {
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let libbox_dir = Path::new(&manifest_dir).join("../core_library/libbox-c-shared");
        let out_dir = std::path::PathBuf::from(env::var("OUT_DIR").unwrap());

        println!(
            "cargo:warning=Building libbox for Android target: {}",
            env::var("TARGET").unwrap_or_default()
        );

        let target_triple = env::var("TARGET").unwrap_or_default();
        let mut cmd = Command::new("go");
        cmd.current_dir(&libbox_dir).args(&[
            "build",
            "-tags",
            "with_clash_api,with_gvisor,with_quic,with_wireguard,with_utls,android",
            "-buildmode=c-shared",
        ]);

        cmd.arg("-o").arg(out_dir.join("libbox.so")).arg("main.go");

        cmd.env("CGO_ENABLED", "1").env("GOOS", "android");

        // Resolve NDK Home
        let ndk_home = env::var("ANDROID_NDK_HOME")
            .or_else(|_| env::var("NDK_HOME"))
            .or_else(|_| {
                env::var("ANDROID_HOME").map(|h| {
                    let ndk_root = Path::new(&h).join("ndk");
                    if let Ok(entries) = std::fs::read_dir(&ndk_root) {
                        if let Some(entry) = entries.filter_map(Result::ok).next() {
                            return entry.path().to_string_lossy().to_string();
                        }
                    }
                    ndk_root.to_string_lossy().to_string()
                })
            })
            .expect("ANDROID_NDK_HOME or ANDROID_HOME must be set");

        let host_os = "darwin";
        let toolchain_bin = Path::new(&ndk_home)
            .join("toolchains/llvm/prebuilt")
            .join(format!("{}-x86_64", host_os))
            .join("bin");

        let mut android_abi = "";

        if target_triple.starts_with("aarch64") {
            cmd.env("GOARCH", "arm64");
            android_abi = "arm64-v8a";
            let cc_path = toolchain_bin.join("aarch64-linux-android24-clang");
            if cc_path.exists() {
                cmd.env("CC", &cc_path);
            }
        } else if target_triple.starts_with("arm") {
            cmd.env("GOARCH", "arm");
            android_abi = "armeabi-v7a";
            let cc_path = toolchain_bin.join("armv7a-linux-androideabi24-clang");
            if cc_path.exists() {
                cmd.env("CC", &cc_path);
            }
        } else if target_triple.starts_with("x86_64") {
            cmd.env("GOARCH", "amd64");
            android_abi = "x86_64";
            let cc_path = toolchain_bin.join("x86_64-linux-android24-clang");
            if cc_path.exists() {
                cmd.env("CC", &cc_path);
            }
        } else if target_triple.starts_with("i686") {
            cmd.env("GOARCH", "386");
            android_abi = "x86";
            let cc_path = toolchain_bin.join("i686-linux-android24-clang");
            if cc_path.exists() {
                cmd.env("CC", &cc_path);
            }
        }

        let status = cmd
            .status()
            .expect("Failed to execute go build for Android");

        if !status.success() {
            panic!("Go build for Android failed");
        }

        // Copy to jniLibs
        if !android_abi.is_empty() {
            let jni_libs_dir = Path::new(&manifest_dir)
                .join("gen/android/app/src/main/jniLibs")
                .join(android_abi);
            let _ = std::fs::create_dir_all(&jni_libs_dir);
            let _ = std::fs::copy(out_dir.join("libbox.so"), jni_libs_dir.join("libbox.so"));
            println!(
                "cargo:warning=Copied libbox.so to {}",
                jni_libs_dir.display()
            );
        }

        println!("cargo:rustc-link-search=native={}", out_dir.display());
        println!("cargo:rustc-link-lib=dylib=box");
    } else if target_os == "linux" {
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
    } else if target_os == "windows" {
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let libbox_dir = Path::new(&manifest_dir).join("../core_library/libbox-c-shared");

        // Only rebuild if Go files change
        println!(
            "cargo:rerun-if-changed={}",
            libbox_dir.join("main.go").display()
        );

        // Build Go library as DLL (c-shared)
        let status = Command::new("go")
            .current_dir(&libbox_dir)
            .args(&[
                "build",
                "-tags",
                "with_clash_api,with_gvisor,with_quic,with_wireguard,with_utls,with_wintun",
                "-buildmode=c-shared",
                "-ldflags=-s -w",
                "-o",
                "libbox.dll",
                "main.go",
            ])
            .env("CGO_ENABLED", "1")
            .status()
            .expect("Failed to execute go build");

        if !status.success() {
            panic!("Go build failed");
        }

        // Generate .def file using gendef
        // gendef overwrites libbox.def if it exists
        let status = Command::new("gendef")
            .current_dir(&libbox_dir)
            .arg("libbox.dll")
            .status()
            .expect("Failed to execute gendef");

        if !status.success() {
            panic!("gendef failed. Ensure 'gendef' (MinGW-w64) is in your PATH.");
        }

        // Create import library (.lib) for MSVC using lib.exe
        // We assume lib.exe is in the PATH (e.g. running from Dev Cmd or configured in CI)
        let status = Command::new("lib.exe")
            .current_dir(&libbox_dir)
            .args(&["/DEF:libbox.def", "/OUT:box.lib", "/MACHINE:X64", "/NOLOGO"])
            .status();

        let success = status.map(|s| s.success()).unwrap_or(false);

        if !success {
            // Try to locate lib.exe via vswhere or standard locations?
            // For now, panic with a helpful message.
            panic!("Failed to execute lib.exe. Ensure you have MSVC Build Tools installed and available in PATH.");
        }

        // Link instructions
        println!("cargo:rustc-link-search=native={}", libbox_dir.display());
        println!("cargo:rustc-link-lib=box");

        // Link Windows system libraries required by Go / Sing-box
        println!("cargo:rustc-link-lib=ws2_32");
        println!("cargo:rustc-link-lib=iphlpapi");
        println!("cargo:rustc-link-lib=dnsapi");
        println!("cargo:rustc-link-lib=ntdll");
        println!("cargo:rustc-link-lib=userenv");
        println!("cargo:rustc-link-lib=crypt32");

        // Copy libbox.dll to the target directory so the executable can find it
        let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
        let target_dir = Path::new(&manifest_dir).join("target").join(profile);

        // Ensure target directory exists
        if !target_dir.exists() {
            let _ = std::fs::create_dir_all(&target_dir);
        }

        let _ = std::fs::copy(libbox_dir.join("libbox.dll"), target_dir.join("libbox.dll"));
    }

    let mut windows = tauri_build::WindowsAttributes::new();

    // Only add manifest in release mode to allow 'cargo run' to work in non-admin terminals
    // In dev mode, if you need TUN, you must run the terminal as Administrator manually.
    let profile = env::var("PROFILE").unwrap_or_default();
    if profile != "debug" {
        windows = windows.app_manifest(
            r#"
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
"#,
        );
    }

    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run build script");
}
