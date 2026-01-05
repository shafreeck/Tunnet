fn main() {
    println!("cargo:rustc-link-search=native=../libbox-c-shared");
    println!("cargo:rustc-link-lib=dylib=box");
}
