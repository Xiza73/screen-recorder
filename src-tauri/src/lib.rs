use tauri::Manager as _;

pub mod capture;
pub mod encode;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(capture::Recorder::default());
            app.manage(capture::picker::PanelGeometry::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            encode::ffmpeg_status,
            capture::start_recording,
            capture::stop_recording,
            capture::preview_frame,
            capture::picker::list_monitors,
            capture::picker::open_overlay,
            capture::picker::close_overlay,
            capture::picker::set_panel_mode,
            capture::output::output_dir,
            capture::output::set_output_dir
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
