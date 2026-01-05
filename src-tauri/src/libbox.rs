use std::os::raw::c_char;

#[link(name = "box")]
extern "C" {
    pub fn LibboxStart(config: *const c_char) -> *const c_char;
    pub fn LibboxStop() -> *const c_char;
    pub fn LibboxHello() -> *const c_char;
}
