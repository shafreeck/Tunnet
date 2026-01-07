use std::os::raw::c_char;

#[cfg_attr(not(target_os = "ios"), link(name = "box"))]
#[cfg_attr(target_os = "ios", link(name = "box_ios"))]
extern "C" {
    pub fn LibboxStart(config: *const c_char, log_fd: i64) -> *const c_char;
    pub fn LibboxStop() -> *const c_char;
    pub fn LibboxHello() -> *const c_char;
    pub fn LibboxTestOutbound(
        outbound_json: *const c_char,
        target_url: *const c_char,
        timeout_ms: i64,
    ) -> *const c_char;
    pub fn LibboxFetch(
        outbound_json: *const c_char,
        target_url: *const c_char,
        timeout_ms: i64,
    ) -> *const c_char;
    pub fn LibboxTestBatch(
        outbounds_json: *const c_char,
        target_url: *const c_char,
        timeout_ms: i64,
    ) -> *const c_char;
    pub fn LibboxStartMobile(fd: i32, config: *const c_char, log_fd: i64) -> *const c_char;
}
