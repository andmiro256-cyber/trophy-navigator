fn main() {
    println!("cargo:rerun-if-changed=../ui/index.html");
    println!("cargo:rerun-if-changed=../ui/leaflet.css");
    println!("cargo:rerun-if-changed=../ui/leaflet.js");
    tauri_build::build()
}
