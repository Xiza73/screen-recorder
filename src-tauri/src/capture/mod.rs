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

use serde::{Deserialize, Serialize};
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
    #[error("la región pedida no es capturable")]
    InvalidRegion,
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
    #[error("no se pudo abrir el selector de región")]
    PickerFailed,
}

pub mod picker;

/// Región del escritorio virtual a capturar, en píxeles **físicos**.
///
/// `x` e `y` pueden ser negativos: en multi-monitor, una pantalla ubicada a la
/// izquierda de la primaria vive en coordenadas negativas del escritorio
/// virtual. La región puede cruzar monitores — para el demuxer es un rectángulo
/// más, no le importa dónde caiga.
///
/// Llega del frontend: es input no confiable y se valida en [`Region::normalized`].
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub struct Region {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Region {
    const MIN_SIDE: u32 = 16;
    /// Límite de nivel de h264.
    const MAX_SIDE: u32 = 16_384;

    /// Ajusta a dimensiones pares y valida el rango.
    ///
    /// h264 con `yuv420p` submuestrea croma en bloques de 2×2: un ancho o alto
    /// impar hace fallar el encoder. Se redondea para abajo en vez de rechazar,
    /// porque nadie arrastra un rectángulo pensando en paridad.
    fn normalized(self) -> Result<Self, CaptureError> {
        let width = self.width & !1;
        let height = self.height & !1;

        let en_rango = |lado: u32| (Self::MIN_SIDE..=Self::MAX_SIDE).contains(&lado);
        if !en_rango(width) || !en_rango(height) {
            return Err(CaptureError::InvalidRegion);
        }

        Ok(Self {
            width,
            height,
            ..self
        })
    }
}

/// Opciones de recorte que van **antes** del `-i`.
#[cfg(target_os = "windows")]
fn crop_input_args(region: Option<Region>) -> Vec<String> {
    let Some(r) = region else {
        return Vec::new();
    };

    vec![
        "-offset_x".to_owned(),
        r.x.to_string(),
        "-offset_y".to_owned(),
        r.y.to_string(),
        "-video_size".to_owned(),
        format!("{}x{}", r.width, r.height),
    ]
}

#[cfg(target_os = "macos")]
fn crop_input_args(_region: Option<Region>) -> Vec<String> {
    // avfoundation no recorta en el demuxer: lo hace el filtro `crop`.
    Vec::new()
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn crop_input_args(region: Option<Region>) -> Vec<String> {
    let Some(r) = region else {
        return Vec::new();
    };

    vec![
        "-video_size".to_owned(),
        format!("{}x{}", r.width, r.height),
    ]
}

/// Destino del `-i`. En x11grab el offset viaja pegado al display.
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn input_target(region: Option<Region>) -> String {
    match region {
        Some(r) => format!("{INPUT_TARGET}+{},{}", r.x, r.y),
        None => INPUT_TARGET.to_owned(),
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn input_target(_region: Option<Region>) -> String {
    INPUT_TARGET.to_owned()
}

/// Filtros que van **después** del `-i`. Solo macOS recorta por esta vía.
#[cfg(target_os = "macos")]
fn crop_filter_args(region: Option<Region>) -> Vec<String> {
    let Some(r) = region else {
        return Vec::new();
    };

    vec![
        "-vf".to_owned(),
        format!("crop={}:{}:{}:{}", r.width, r.height, r.x, r.y),
    ]
}

#[cfg(not(target_os = "macos"))]
fn crop_filter_args(_region: Option<Region>) -> Vec<String> {
    Vec::new()
}

/// Argumentos de ffmpeg. Sin `region`, captura el escritorio completo.
///
/// Devuelve `OsString` y no `String`: en Windows las rutas son UTF-16 y una
/// conversión lossy podría mutilar el nombre del archivo de salida.
///
/// Nota honesta: solo el camino de Windows (`gdigrab`) está probado en máquina.
/// Los de macOS y Linux siguen la documentación de ffmpeg pero no se ejecutaron.
pub fn build_args(
    fps: u32,
    output: &Path,
    region: Option<Region>,
) -> Result<Vec<OsString>, CaptureError> {
    if !(FPS_MIN..=FPS_MAX).contains(&fps) {
        return Err(CaptureError::InvalidFps);
    }

    let region = region.map(Region::normalized).transpose()?;

    let mut parts = vec![
        "-y".to_owned(),
        "-f".to_owned(),
        INPUT_FORMAT.to_owned(),
        "-framerate".to_owned(),
        fps.to_string(),
    ];

    parts.extend(crop_input_args(region));
    parts.push("-i".to_owned());
    parts.push(input_target(region));
    parts.extend(crop_filter_args(region));

    parts.extend([
        "-c:v".to_owned(),
        "libx264".to_owned(),
        // ponytail: gdigrab + libx264 ultrafast es lo más simple que funciona.
        // Techo medido: ~19-21 fps reales de 30 pedidos en pantalla completa.
        // Camino de upgrade: `-f lavfi -i ddagrab` (GPU) y h264_nvenc/qsv.
        "-preset".to_owned(),
        "ultrafast".to_owned(),
        // yuv420p: sin esto el mp4 no abre en QuickTime ni en varios players.
        "-pix_fmt".to_owned(),
        "yuv420p".to_owned(),
    ]);

    let mut args: Vec<OsString> = parts.into_iter().map(OsString::from).collect();
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

/// Inicia la grabación. Sin `region`, captura el escritorio completo.
///
/// `fps` y `region` vienen del frontend: los valida [`build_args`].
#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    recorder: tauri::State<'_, Recorder>,
    fps: u32,
    region: Option<Region>,
) -> Result<String, CaptureError> {
    let ffmpeg = crate::encode::resolve().map_err(|_| CaptureError::FfmpegUnavailable)?;
    let output = default_output(&app)?;
    let args = build_args(fps, &output, region)?;

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

    const SALIDA: &str = "salida.mp4";

    fn region(width: u32, height: u32) -> Region {
        Region {
            x: 100,
            y: 50,
            width,
            height,
        }
    }

    fn args_de(fps: u32, region: Option<Region>) -> Vec<String> {
        as_strings(&build_args(fps, Path::new(SALIDA), region).expect("argumentos válidos"))
    }

    #[test]
    fn arma_los_argumentos_de_captura() {
        let args = args_de(30, None);

        assert_eq!(args.first().map(String::as_str), Some("-y"));
        assert!(args.contains(&INPUT_FORMAT.to_owned()));
        assert_eq!(args.last().map(String::as_str), Some(SALIDA));
    }

    #[test]
    fn los_fps_viajan_como_argumento_propio() {
        let args = args_de(60, None);
        let i = args
            .iter()
            .position(|a| a == "-framerate")
            .expect("debe estar -framerate");

        assert_eq!(args.get(i + 1).map(String::as_str), Some("60"));
    }

    #[test]
    fn rechaza_fps_fuera_de_rango() {
        // `fps` cruza la frontera IPC: es input no confiable.
        for fps in [0, 121, u32::MAX] {
            assert_eq!(
                build_args(fps, Path::new(SALIDA), None),
                Err(CaptureError::InvalidFps)
            );
        }
    }

    #[test]
    fn una_ruta_con_espacios_es_un_solo_argumento() {
        // La prueba de que no hay interpolación de shell: un nombre con espacios
        // y comillas viaja entero, sin partirse ni escaparse.
        let ruta = Path::new(r#"C:\mis videos\demo "final".mp4"#);
        let args = build_args(30, ruta, None).expect("válido");

        assert_eq!(args.last().map(OsString::as_os_str), Some(ruta.as_os_str()));
        assert_eq!(as_strings(&args).len(), 14);
    }

    #[test]
    fn sin_region_no_agrega_opciones_de_recorte() {
        let args = args_de(30, None);

        assert!(!args.iter().any(|a| a == "-video_size"));
        assert!(!args.iter().any(|a| a.starts_with("crop=")));
        assert_eq!(args.len(), 14);
    }

    #[test]
    fn con_region_los_argumentos_crecen() {
        let completo = args_de(30, None).len();
        let recortado = args_de(30, Some(region(800, 600))).len();

        assert!(recortado > completo, "la región debe agregar argumentos");
    }

    #[test]
    fn redondea_dimensiones_impares_a_pares() {
        // h264 con yuv420p submuestrea croma en bloques de 2x2: una dimensión
        // impar hace fallar el encoder. Se redondea para abajo.
        let ajustada = region(801, 601)
            .normalized()
            .expect("válida tras redondear");

        assert_eq!((ajustada.width, ajustada.height), (800, 600));
    }

    #[test]
    fn acepta_coordenadas_negativas() {
        // Multi-monitor: una pantalla a la izquierda de la primaria vive en
        // coordenadas negativas del escritorio virtual.
        let r = Region {
            x: -1920,
            y: -200,
            width: 640,
            height: 480,
        };

        assert_eq!(r.normalized(), Ok(r));
    }

    #[test]
    fn rechaza_regiones_no_capturables() {
        // `region` cruza la frontera IPC. Un 0x0 o un tamaño absurdo llegarían
        // a ffmpeg como argumentos válidos y romperían el proceso.
        for (w, h) in [(0, 0), (1, 1), (15, 600), (800, 15), (99_999, 600)] {
            assert_eq!(
                region(w, h).normalized(),
                Err(CaptureError::InvalidRegion),
                "{w}x{h} no debería ser capturable"
            );
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn en_windows_el_recorte_va_como_offset_y_video_size() {
        let args = args_de(30, Some(region(800, 600)));
        let valor = |clave: &str| {
            args.iter()
                .position(|a| a == clave)
                .and_then(|i| args.get(i + 1))
                .cloned()
        };

        assert_eq!(valor("-offset_x").as_deref(), Some("100"));
        assert_eq!(valor("-offset_y").as_deref(), Some("50"));
        assert_eq!(valor("-video_size").as_deref(), Some("800x600"));

        // El recorte tiene que ir ANTES del -i: son opciones del demuxer.
        let i_offset = args.iter().position(|a| a == "-offset_x");
        let i_input = args.iter().position(|a| a == "-i");
        assert!(i_offset < i_input, "el recorte va antes del -i");
    }

    #[test]
    fn el_error_serializa_discriminado_por_kind() {
        let json = serde_json::to_string(&CaptureError::AlreadyRecording).expect("serializable");

        assert_eq!(json, r#"{"kind":"alreadyRecording"}"#);
    }
}
