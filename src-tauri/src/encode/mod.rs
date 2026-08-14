//! Detección del binario de ffmpeg.
//!
//! La app **no descarga ni empaqueta** ffmpeg: lo instala el usuario con el
//! gestor de paquetes de su sistema. Este módulo lo localiza, confirma que
//! responde de verdad como ffmpeg, y expone un estado claro a la UI.
//!
//! Ver `CLAUDE.md` § Integraciones externas.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use thiserror::Error;

#[cfg(windows)]
const BINARY_NAME: &str = "ffmpeg.exe";
#[cfg(not(windows))]
const BINARY_NAME: &str = "ffmpeg";

#[cfg(target_os = "windows")]
const INSTALL_HINT: &str = "winget install Gyan.FFmpeg";
#[cfg(target_os = "macos")]
const INSTALL_HINT: &str = "brew install ffmpeg";
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
const INSTALL_HINT: &str = "sudo apt install ffmpeg (o el gestor de tu distro)";

/// Errores de detección, serializables a TS como `{ "kind": "notFound" }`.
///
/// Los mensajes son genéricos a propósito: no filtran rutas absolutas ni
/// nombres de usuario al frontend.
#[derive(Debug, Error, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FfmpegError {
    #[error("ffmpeg no está instalado o no está en el PATH")]
    NotFound,
    #[error("se encontró un ejecutable pero no responde como ffmpeg")]
    NotUsable,
}

/// Estado que consume la UI.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum FfmpegStatus {
    /// ffmpeg disponible y verificado. No se expone la ruta: al frontend le
    /// alcanza con la versión, y la ruta es un detalle del sistema.
    Ready { version: String },
    /// Falta ffmpeg. `hint` es el comando de instalación de esta plataforma.
    Missing { hint: &'static str },
}

/// Busca `ffmpeg` recorriendo **solo** las entradas de `PATH`.
///
/// No delegamos la resolución a `Command::new("ffmpeg")`: en Windows,
/// `CreateProcess` busca primero en el directorio de la aplicación y en el
/// directorio actual, así que un `ffmpeg.exe` plantado ahí se ejecutaría antes
/// que el real. Resolvemos la ruta absoluta nosotros y la spawneamos completa.
pub fn resolve() -> Result<PathBuf, FfmpegError> {
    let path_var = std::env::var_os("PATH").ok_or(FfmpegError::NotFound)?;

    find_in(std::env::split_paths(&path_var), BINARY_NAME).ok_or(FfmpegError::NotFound)
}

/// Primer `dir/name` que sea un archivo regular. Separada de [`resolve`] para
/// poder testearla sin depender del PATH de la máquina.
fn find_in<I>(dirs: I, name: &str) -> Option<PathBuf>
where
    I: IntoIterator<Item = PathBuf>,
{
    dirs.into_iter()
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

/// Ejecuta `ffmpeg -version` y confirma que el binario se identifica como tal.
///
/// Encontrar un archivo llamado `ffmpeg` no alcanza: cualquiera puede dejar uno
/// en el PATH. Esto valida que sea lo que dice ser antes de confiar en él.
pub fn probe(path: &Path) -> Result<String, FfmpegError> {
    let output = Command::new(path)
        .arg("-version")
        .output()
        .map_err(|_| FfmpegError::NotUsable)?;

    if !output.status.success() {
        return Err(FfmpegError::NotUsable);
    }

    parse_version(&String::from_utf8_lossy(&output.stdout)).ok_or(FfmpegError::NotUsable)
}

/// Extrae el token de versión de la salida de `ffmpeg -version`.
///
/// Primera línea esperada: `ffmpeg version <token> Copyright (c) ...`
fn parse_version(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .next()?
        .strip_prefix("ffmpeg version ")?
        .split_whitespace()
        .next()
        .map(str::to_owned)
}

/// Estado de ffmpeg para la UI. No recibe input, así que no hay nada que validar.
#[tauri::command]
pub async fn ffmpeg_status() -> FfmpegStatus {
    // ponytail: `ffmpeg -version` tarda ~50 ms y se llama al arrancar.
    // Si alguna vez se llama en un loop, mover a spawn_blocking.
    match resolve().and_then(|path| probe(&path)) {
        Ok(version) => FfmpegStatus::Ready { version },
        Err(_) => FfmpegStatus::Missing { hint: INSTALL_HINT },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("no se pudo preparar el directorio de prueba");
        dir
    }

    #[test]
    fn encuentra_el_binario_en_la_segunda_entrada_del_path() {
        let vacio = scratch("sr_find_vacio");
        let con_binario = scratch("sr_find_ok");
        std::fs::write(con_binario.join("ffmpeg"), b"").expect("no se pudo crear el archivo");

        let hallado = find_in(vec![vacio.clone(), con_binario.clone()], "ffmpeg");

        assert_eq!(hallado, Some(con_binario.join("ffmpeg")));
    }

    #[test]
    fn devuelve_none_si_no_esta_en_ninguna_entrada() {
        let vacio = scratch("sr_find_nada");

        assert_eq!(find_in(vec![vacio], "ffmpeg"), None);
    }

    #[test]
    fn ignora_un_directorio_que_se_llame_igual() {
        // Caso real: una carpeta `ffmpeg/` en el PATH no es un ejecutable.
        let dir = scratch("sr_find_es_carpeta");
        std::fs::create_dir_all(dir.join("ffmpeg")).expect("no se pudo crear la carpeta");

        assert_eq!(find_in(vec![dir], "ffmpeg"), None);
    }

    #[test]
    fn parsea_la_version_de_un_build_de_windows() {
        let salida = "ffmpeg version 8.1-full_build-www.gyan.dev Copyright (c) 2000-2025 the FFmpeg developers\nbuilt with gcc";

        assert_eq!(
            parse_version(salida).as_deref(),
            Some("8.1-full_build-www.gyan.dev")
        );
    }

    #[test]
    fn parsea_la_version_de_un_build_de_linux() {
        let salida = "ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023 the FFmpeg developers";

        assert_eq!(parse_version(salida).as_deref(), Some("6.1.1-3ubuntu5"));
    }

    #[test]
    fn rechaza_un_binario_que_no_se_identifica_como_ffmpeg() {
        // Un impostor en el PATH: existe, ejecuta, pero no es ffmpeg.
        assert_eq!(parse_version("bash: command not found"), None);
        assert_eq!(parse_version(""), None);
    }

    #[test]
    fn el_estado_serializa_discriminado_por_status() {
        let listo = FfmpegStatus::Ready {
            version: "8.1".to_owned(),
        };
        let falta = FfmpegStatus::Missing { hint: "instalalo" };

        assert_eq!(
            serde_json::to_string(&listo).expect("serializable"),
            r#"{"status":"ready","version":"8.1"}"#
        );
        assert_eq!(
            serde_json::to_string(&falta).expect("serializable"),
            r#"{"status":"missing","hint":"instalalo"}"#
        );
    }
}
