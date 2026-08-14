//! Carpeta de salida de las grabaciones.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::CaptureError;

/// Archivo donde se recuerda la carpeta elegida.
///
/// Un `.txt` con una ruta y nada más. Mientras haya **un solo** ajuste, un JSON
/// con su struct y su serde es ceremonia; cuando aparezca el segundo, se migra.
fn config_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("output-dir.txt"))
}

/// Carpeta donde se guardan las grabaciones.
///
/// La elegida por el usuario si todavía existe; si no, la de Videos. Una carpeta
/// que fue borrada o está en un disco desconectado se descarta en silencio: es
/// mejor grabar en Videos que fallar al arrancar.
pub fn resolve_dir(app: &AppHandle) -> Result<PathBuf, CaptureError> {
    let elegida = config_file(app)
        .and_then(|archivo| std::fs::read_to_string(archivo).ok())
        .map(|ruta| PathBuf::from(ruta.trim()))
        .filter(|ruta| ruta.is_dir());

    match elegida {
        Some(dir) => Ok(dir),
        None => app
            .path()
            .video_dir()
            .map_err(|_| CaptureError::OutputDirUnavailable),
    }
}

/// Recuerda la carpeta elegida.
///
/// La ruta sale del diálogo nativo del sistema, pero igual cruza la frontera
/// IPC: se verifica que exista y que sea un directorio antes de aceptarla.
pub fn remember_dir(app: &AppHandle, dir: &Path) -> Result<(), CaptureError> {
    if !dir.is_dir() {
        return Err(CaptureError::OutputDirUnavailable);
    }

    let archivo = config_file(app).ok_or(CaptureError::OutputDirUnavailable)?;

    if let Some(padre) = archivo.parent() {
        std::fs::create_dir_all(padre).map_err(|_| CaptureError::OutputDirUnavailable)?;
    }

    std::fs::write(&archivo, dir.to_string_lossy().as_bytes())
        .map_err(|_| CaptureError::OutputDirUnavailable)
}

/// Carpeta actual, para mostrarla en la UI.
///
/// Acá sí se expone la ruta absoluta al frontend: el usuario pidió saber dónde
/// se guardan sus grabaciones, y es su propia máquina. Es información que pidió,
/// no un detalle del sistema que se escapa en un mensaje de error.
#[tauri::command]
pub fn output_dir(app: AppHandle) -> Result<String, CaptureError> {
    Ok(resolve_dir(&app)?.to_string_lossy().into_owned())
}

/// Fija la carpeta de salida. Devuelve la ruta ya validada.
#[tauri::command]
pub fn set_output_dir(app: AppHandle, path: String) -> Result<String, CaptureError> {
    let dir = PathBuf::from(path);
    remember_dir(&app, &dir)?;

    Ok(dir.to_string_lossy().into_owned())
}
