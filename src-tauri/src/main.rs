// Evita que se abra una consola extra en Windows release. NO BORRAR.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    screen_recorder_lib::run()
}
