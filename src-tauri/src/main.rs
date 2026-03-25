// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Work around broken DMABUF renderer on some Linux GPU/Wayland combos
    // (causes white screen / "Failed to create GBM buffer" errors)
    #[cfg(target_os = "linux")]
    {
        if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        // mpv requires LC_NUMERIC=C for proper number parsing
        std::env::set_var("LC_NUMERIC", "C");
    }

    let verbose = std::env::args().any(|a| a == "--verbose" || a == "-v");
    crabbit_lib::run(verbose);
}
