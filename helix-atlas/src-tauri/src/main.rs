// Keep the console window hidden in Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    helix_atlas_lib::run()
}
