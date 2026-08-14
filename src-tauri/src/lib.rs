pub mod capture;
pub mod encode;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(capture::Recorder::default())
        .invoke_handler(tauri::generate_handler![
            encode::ffmpeg_status,
            capture::start_recording,
            capture::stop_recording
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
