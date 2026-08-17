use tauri::Manager as _;

pub mod capture;
pub mod encode;
pub mod shortcuts;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(capture::Recorder::default());
            app.manage(capture::picker::PanelGeometry::default());

            // Que el atajo esté tomado por otra app NO impide arrancar: se
            // recuerda el resultado y la UI lo informa.
            let registrado =
                shortcuts::register_toggle(app.handle(), shortcuts::DEFAULT_TOGGLE).is_ok();

            let estado = shortcuts::Shortcuts::default();
            estado.remember(shortcuts::ShortcutStatus {
                accelerator: shortcuts::DEFAULT_TOGGLE.to_owned(),
                registered: registrado,
            });
            app.manage(estado);

            Ok(())
        })
        .on_window_event(|window, event| {
            // Solo la principal decide el cierre de la app.
            if window.label() != "main" {
                return;
            }
            if !matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                return;
            }

            let app = window.app_handle();

            // Una grabación en curso se cierra bien ANTES de salir: matar el
            // proceso de ffmpeg dejaría el mp4 sin el atom `moov`, o sea
            // inreproducible. El usuario perdería la toma entera por cerrar.
            if let Some(recorder) = app.try_state::<capture::Recorder>() {
                let _ = recorder.stop();
            }

            // Cerrar la principal cierra todo. Sin esto el overlay mantiene el
            // proceso vivo y el atenuado queda pegado en pantalla, sin ninguna
            // ventana desde la cual sacarlo.
            app.exit(0);
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
            capture::output::set_output_dir,
            shortcuts::shortcut_status
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
