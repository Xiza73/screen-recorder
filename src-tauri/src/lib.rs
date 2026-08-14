#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Los #[tauri::command] se registran acá con .invoke_handler(...)
        // cuando exista el primero (Fase 1: captura -> encode -> disco).
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
