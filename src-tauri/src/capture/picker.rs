//! Modo selección de región.
//!
//! No se abre una segunda ventana: **la principal se convierte en el overlay**.
//! Se agranda hasta cubrir el escritorio virtual, se pone always-on-top, y al
//! terminar vuelve a su geometría anterior.
//!
//! Se hizo así después de que el enfoque de dos ventanas fallara dos veces con
//! síntomas imposibles de observar (una webview en blanco no tiene consola a la
//! que llegar). Con una sola ventana no hay segunda carga, ni segunda
//! capability, ni eventos entre ventanas: la superficie de falla se achica y lo
//! que quede roto se ve.
//!
//! Todo acá se maneja en píxeles **físicos**: es lo que reportan los monitores y
//! lo que después consume ffmpeg.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{PhysicalPosition, PhysicalSize, Window};

use super::CaptureError;

/// Rectángulo en píxeles físicos.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Un monitor, con la misma forma que una región.
///
/// Para el pipeline de captura una pantalla entera no es más que un rectángulo:
/// exponerla así evita un segundo camino de código para "grabar un monitor".
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
}

/// Geometría del panel, guardada para restaurarla al salir del modo selección.
#[derive(Default)]
pub struct PanelGeometry(Mutex<Option<(PhysicalPosition<i32>, PhysicalSize<u32>)>>);

/// Unión de todos los monitores: el escritorio virtual.
///
/// Separada del comando para poder testearla sin depender de las pantallas
/// reales de la máquina donde corren los tests.
fn union_bounds(rects: &[(i32, i32, u32, u32)]) -> Option<DesktopBounds> {
    let (first, rest) = rects.split_first()?;

    let mut min_x = first.0;
    let mut min_y = first.1;
    let mut max_x = first.0 + first.2 as i32;
    let mut max_y = first.1 + first.3 as i32;

    for &(x, y, w, h) in rest {
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x + w as i32);
        max_y = max_y.max(y + h as i32);
    }

    Some(DesktopBounds {
        x: min_x,
        y: min_y,
        width: (max_x - min_x).max(0) as u32,
        height: (max_y - min_y).max(0) as u32,
    })
}

fn monitor_rects(window: &Window) -> Result<Vec<(i32, i32, u32, u32)>, CaptureError> {
    Ok(window
        .available_monitors()
        .map_err(|_| CaptureError::PickerFailed)?
        .iter()
        .map(|m| {
            let p = m.position();
            let s = m.size();
            (p.x, p.y, s.width, s.height)
        })
        .collect())
}

/// Monitores conectados.
#[tauri::command]
pub fn list_monitors(window: Window) -> Result<Vec<MonitorInfo>, CaptureError> {
    // La primaria se identifica por posición: `Monitor` no implementa PartialEq.
    let primaria = window
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| (m.position().x, m.position().y));

    Ok(window
        .available_monitors()
        .map_err(|_| CaptureError::PickerFailed)?
        .iter()
        .map(|m| {
            let p = m.position();
            let s = m.size();
            MonitorInfo {
                x: p.x,
                y: p.y,
                width: s.width,
                height: s.height,
                primary: primaria == Some((p.x, p.y)),
            }
        })
        .collect())
}

/// Expande la ventana para cubrir el escritorio virtual.
///
/// Devuelve los límites en píxeles físicos: el frontend los necesita para
/// convertir el rectángulo que dibuja el usuario, que está en píxeles CSS.
#[tauri::command]
pub fn enter_region_mode(
    window: Window,
    saved: tauri::State<'_, PanelGeometry>,
) -> Result<DesktopBounds, CaptureError> {
    let bounds = union_bounds(&monitor_rects(&window)?).ok_or(CaptureError::PickerFailed)?;

    // Guardar ANTES de mover: sin esto no hay forma de volver al panel.
    let previa = (
        window
            .outer_position()
            .map_err(|_| CaptureError::PickerFailed)?,
        window
            .outer_size()
            .map_err(|_| CaptureError::PickerFailed)?,
    );
    *saved.0.lock().map_err(|_| CaptureError::StatePoisoned)? = Some(previa);

    let listo = window
        .set_always_on_top(true)
        .and_then(|()| window.set_position(PhysicalPosition::new(bounds.x, bounds.y)))
        .and_then(|()| window.set_size(PhysicalSize::new(bounds.width, bounds.height)));

    if listo.is_err() {
        // Nunca dejar la ventana a medio expandir tapando el escritorio.
        let _ = restore(&window, &saved);
        return Err(CaptureError::PickerFailed);
    }

    Ok(bounds)
}

/// Devuelve la ventana a su geometría de panel.
#[tauri::command]
pub fn exit_region_mode(
    window: Window,
    saved: tauri::State<'_, PanelGeometry>,
) -> Result<(), CaptureError> {
    restore(&window, &saved)
}

fn restore(window: &Window, saved: &tauri::State<'_, PanelGeometry>) -> Result<(), CaptureError> {
    let previa = saved
        .0
        .lock()
        .map_err(|_| CaptureError::StatePoisoned)?
        .take();

    let _ = window.set_always_on_top(false);

    if let Some((position, size)) = previa {
        // Tamaño antes que posición: al revés, con la ventana todavía enorme,
        // Windows puede reubicarla sola para que entre en pantalla.
        let _ = window.set_size(size);
        let _ = window.set_position(position);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_solo_monitor_es_su_propio_rectangulo() {
        let b = union_bounds(&[(0, 0, 1920, 1080)]).expect("hay un monitor");

        assert_eq!(
            b,
            DesktopBounds {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080
            }
        );
    }

    #[test]
    fn dos_monitores_lado_a_lado_se_suman() {
        // La máquina de referencia: dos 1920x1080 → escritorio de 3840x1080.
        let b = union_bounds(&[(0, 0, 1920, 1080), (1920, 0, 1920, 1080)]).expect("dos monitores");

        assert_eq!((b.x, b.y, b.width, b.height), (0, 0, 3840, 1080));
    }

    #[test]
    fn un_monitor_a_la_izquierda_da_origen_negativo() {
        // El caso que rompe todo si asumís que el escritorio arranca en (0,0).
        let b = union_bounds(&[(0, 0, 1920, 1080), (-1920, 0, 1920, 1080)]).expect("dos monitores");

        assert_eq!((b.x, b.y), (-1920, 0));
        assert_eq!(b.width, 3840);
    }

    #[test]
    fn monitores_desalineados_en_vertical() {
        let b = union_bounds(&[(0, 0, 1920, 1080), (1920, -300, 1280, 1024)]).expect("dos");

        assert_eq!((b.x, b.y), (0, -300));
        assert_eq!((b.width, b.height), (3200, 1380));
    }

    #[test]
    fn sin_monitores_no_hay_rectangulo() {
        assert_eq!(union_bounds(&[]), None);
    }
}
