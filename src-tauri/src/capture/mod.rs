//! Captura de pantalla vía ffmpeg.
//!
//! ffmpeg hace la captura y el encoding; Rust arma los argumentos y supervisa el
//! proceso. Ver `CLAUDE.md` § Stack.
//!
//! Dos reglas ordenan este módulo:
//!
//! 1. **Cada argumento es un elemento del vector.** Nunca se interpola nada en
//!    un string de shell. Ver `security-review` § 1b.
//! 2. **La ruta de salida la decide Rust**, no el frontend. Mientras no exista
//!    un selector nativo, no hay ninguna ruta cruzando la frontera IPC: eso
//!    elimina de raíz la superficie de path traversal.

use std::ffi::OsString;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use thiserror::Error;

/// Rango de fps admitido. `fps` llega del frontend: es input no confiable.
const FPS_MIN: u32 = 1;
const FPS_MAX: u32 = 120;

#[cfg(target_os = "windows")]
const INPUT_FORMAT: &str = "gdigrab";
#[cfg(target_os = "windows")]
const INPUT_TARGET: &str = "desktop";

#[cfg(target_os = "macos")]
const INPUT_FORMAT: &str = "avfoundation";
#[cfg(target_os = "macos")]
const INPUT_TARGET: &str = "1:none";

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
const INPUT_FORMAT: &str = "x11grab";
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
const INPUT_TARGET: &str = ":0.0";

#[derive(Debug, Error, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CaptureError {
    #[error("los fps pedidos están fuera del rango admitido")]
    InvalidFps,
    #[error("no se pudo resolver la carpeta de videos")]
    OutputDirUnavailable,
    #[error("ffmpeg no está disponible")]
    FfmpegUnavailable,
    #[error("no se pudo iniciar la grabación")]
    SpawnFailed,
    #[error("ya hay una grabación en curso")]
    AlreadyRecording,
    #[error("no hay ninguna grabación en curso")]
    NotRecording,
    #[error("el estado de la grabación quedó inconsistente")]
    StatePoisoned,
}

/// Argumentos de ffmpeg para capturar la pantalla completa.
///
/// Devuelve `OsString` y no `String`: en Windows las rutas son UTF-16 y una
/// conversión lossy podría mutilar el nombre del archivo de salida.
pub fn build_args(fps: u32, output: &Path) -> Result<Vec<OsString>, CaptureError> {
    if !(FPS_MIN..=FPS_MAX).contains(&fps) {
        return Err(CaptureError::InvalidFps);
    }

    let mut args: Vec<OsString> = [
        "-y",
        "-f",
        INPUT_FORMAT,
        "-framerate",
        &fps.to_string(),
        "-i",
        INPUT_TARGET,
        "-c:v",
        "libx264",
        // ponytail: gdigrab + libx264 ultrafast es lo más simple que funciona.
        // Techo conocido: CPU alta en pantalla completa a 60 fps. Camino de
        // upgrade cuando moleste: `-f lavfi -i ddagrab` (GPU) y h264_nvenc/qsv.
        "-preset",
        "ultrafast",
        // yuv420p: sin esto el mp4 no abre en QuickTime ni en varios players.
        "-pix_fmt",
        "yuv420p",
    ]
    .iter()
    .map(OsString::from)
    .collect();

    args.push(output.as_os_str().to_owned());

    Ok(args)
}

/// Ruta de salida: carpeta de Videos del usuario + timestamp.
pub fn default_output(app: &AppHandle) -> Result<PathBuf, CaptureError> {
    let dir = app
        .path()
        .video_dir()
        .map_err(|_| CaptureError::OutputDirUnavailable)?;

    let name = format!(
        "screen-recorder-{}.mp4",
        chrono::Local::now().format("%Y%m%d-%H%M%S")
    );

    Ok(dir.join(name))
}

/// Proceso de ffmpeg en curso. Se registra como estado manejado de Tauri.
#[derive(Default)]
pub struct Recorder(Mutex<Option<Child>>);

impl Recorder {
    fn start(&self, ffmpeg: &Path, args: &[OsString]) -> Result<(), CaptureError> {
        let mut slot = self.0.lock().map_err(|_| CaptureError::StatePoisoned)?;

        if slot.is_some() {
            return Err(CaptureError::AlreadyRecording);
        }

        let child = Command::new(ffmpeg)
            .args(args)
            // stdin abierto: es por donde le mandamos 'q' para cerrar limpio.
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| CaptureError::SpawnFailed)?;

        *slot = Some(child);
        Ok(())
    }

    fn stop(&self) -> Result<(), CaptureError> {
        let mut slot = self.0.lock().map_err(|_| CaptureError::StatePoisoned)?;
        let mut child = slot.take().ok_or(CaptureError::NotRecording)?;

        // 'q' por stdin, NO kill(): ffmpeg necesita cerrar el contenedor y
        // escribir el atom `moov`. Matarlo deja un mp4 inreproducible, o sea
        // que el usuario pierde la grabación entera.
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(b"q\n");
            let _ = stdin.flush();
        }

        let _ = child.wait();
        Ok(())
    }
}

/// Inicia la grabación. `fps` viene del frontend y se valida en [`build_args`].
#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    recorder: tauri::State<'_, Recorder>,
    fps: u32,
) -> Result<String, CaptureError> {
    let ffmpeg = crate::encode::resolve().map_err(|_| CaptureError::FfmpegUnavailable)?;
    let output = default_output(&app)?;
    let args = build_args(fps, &output)?;

    recorder.start(&ffmpeg, &args)?;

    // Solo el nombre del archivo, no la ruta absoluta: al frontend le alcanza
    // para mostrar "guardado como X" y no filtramos el sistema de archivos.
    Ok(output
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default())
}

/// Detiene la grabación en curso y cierra el archivo correctamente.
#[tauri::command]
pub fn stop_recording(recorder: tauri::State<'_, Recorder>) -> Result<(), CaptureError> {
    recorder.stop()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn as_strings(args: &[OsString]) -> Vec<String> {
        args.iter()
            .map(|a| a.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn arma_los_argumentos_de_captura() {
        let args = build_args(30, Path::new("salida.mp4")).expect("30 fps es válido");
        let args = as_strings(&args);

        assert_eq!(args.first().map(String::as_str), Some("-y"));
        assert!(args.contains(&INPUT_FORMAT.to_owned()));
        assert_eq!(args.last().map(String::as_str), Some("salida.mp4"));
    }

    #[test]
    fn los_fps_viajan_como_argumento_propio() {
        let args = as_strings(&build_args(60, Path::new("x.mp4")).expect("60 fps es válido"));
        let i = args
            .iter()
            .position(|a| a == "-framerate")
            .expect("debe estar -framerate");

        assert_eq!(args.get(i + 1).map(String::as_str), Some("60"));
    }

    #[test]
    fn rechaza_fps_fuera_de_rango() {
        // `fps` cruza la frontera IPC: es input no confiable.
        assert_eq!(
            build_args(0, Path::new("x.mp4")),
            Err(CaptureError::InvalidFps)
        );
        assert_eq!(
            build_args(121, Path::new("x.mp4")),
            Err(CaptureError::InvalidFps)
        );
        assert_eq!(
            build_args(u32::MAX, Path::new("x.mp4")),
            Err(CaptureError::InvalidFps)
        );
    }

    #[test]
    fn una_ruta_con_espacios_es_un_solo_argumento() {
        // La prueba de que no hay interpolación de shell: un nombre con espacios
        // y comillas viaja entero, sin partirse ni escaparse.
        let ruta = Path::new(r#"C:\mis videos\demo "final".mp4"#);
        let args = build_args(30, ruta).expect("válido");

        assert_eq!(args.last().map(OsString::as_os_str), Some(ruta.as_os_str()));
        assert_eq!(as_strings(&args).len(), 14);
    }

    #[test]
    fn el_error_serializa_discriminado_por_kind() {
        let json = serde_json::to_string(&CaptureError::AlreadyRecording).expect("serializable");

        assert_eq!(json, r#"{"kind":"alreadyRecording"}"#);
    }
}
