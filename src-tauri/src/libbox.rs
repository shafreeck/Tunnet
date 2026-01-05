use std::os::raw::c_char;

#[link(name = "box")]
extern "C" {
    pub fn LibboxStart(config: *const c_char) -> *const c_char;
    pub fn LibboxStop() -> *const c_char;
    pub fn LibboxHello() -> *const c_char;
    pub fn LibboxTestOutbound(
        outbound_json: *const c_char,
        target_url: *const c_char,
        timeout_ms: i64,
    ) -> *const c_char;
}
