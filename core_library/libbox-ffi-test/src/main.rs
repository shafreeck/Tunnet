use std::ffi::{CStr, CString};
use std::os::raw::c_char;

#[link(name = "box")]
unsafe extern "C" {
    fn LibboxHello() -> *mut c_char;
    fn LibboxStart(config_json: *const c_char) -> *mut c_char;
    fn LibboxStop() -> *mut c_char;
}

fn main() {
    unsafe {
        // Test Hello
        let hello_ptr = LibboxHello();
        let hello = CStr::from_ptr(hello_ptr).to_string_lossy();
        println!("Rust received: {}", hello);
        // In real code we should free the string returned by Go if it allocates,
        // but for this test we skip implementing Free func in Go side.

        // Test Start with invalid config
        println!("Attempting to start sing-box...");
        let config = CString::new("{}").unwrap();
        let err_ptr = LibboxStart(config.as_ptr());

        if !err_ptr.is_null() {
            let err_msg = CStr::from_ptr(err_ptr).to_string_lossy();
            println!("Start failed (expected): {}", err_msg);
        } else {
            println!("Start success!");
            // Stop
            LibboxStop();
        }
    }
}
