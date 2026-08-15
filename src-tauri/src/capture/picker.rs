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
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindowBuilder, Window,
};

use super::{CaptureError, Region};

/// Ventana que atenúa el escritorio y marca el área a grabar.
const GUIDE_LABEL: &str = "region-guide";

/// Tamaño del panel en píxeles **lógicos**. Espeja `tauri.conf.json`.
///
/// Al volver del modo selección se restaura esta constante y **no** el tamaño
/// que tenía antes de expandirse. Leerlo parecía lo natural, pero leer con una
/// medida (`inner_size` / `outer_size`) y escribir con otra (`set_size`) corre
/// la ventana unos píxeles por ciclo, y el desvío se acumula hasta que el
/// contenido deja de entrar. Con una constante no hay lectura que pueda no
/// coincidir con la escritura: el problema desaparece por construcción.
const PANEL_WIDTH: f64 = 420.0;
const PANEL_HEIGHT: f64 = 580.0;

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

/// Posición del panel, guardada para restaurarla al salir del modo selección.
///
/// Solo la posición: el tamaño se restaura desde [`PANEL_WIDTH`]/[`PANEL_HEIGHT`].
#[derive(Default)]
pub struct PanelGeometry(Mutex<Option<PhysicalPosition<i32>>>);

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

fn monitor_rects(app: &AppHandle) -> Result<Vec<(i32, i32, u32, u32)>, CaptureError> {
    Ok(app
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

/// Escritorio virtual completo, en píxeles físicos.
fn desktop_bounds(app: &AppHandle) -> Result<DesktopBounds, CaptureError> {
    union_bounds(&monitor_rects(app)?).ok_or(CaptureError::PickerFailed)
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
    let bounds = desktop_bounds(window.app_handle())?;

    // Guardar la posición ANTES de mover: sin esto el panel no vuelve a su
    // lugar. El tamaño no se guarda, se restaura desde la constante.
    let previa = window
        .outer_position()
        .map_err(|_| CaptureError::PickerFailed)?;
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

    // Tamaño antes que posición: al revés, con la ventana todavía del tamaño
    // del escritorio, Windows puede reubicarla sola para que entre en pantalla.
    let _ = window.set_size(LogicalSize::new(PANEL_WIDTH, PANEL_HEIGHT));

    if let Some(position) = previa {
        let _ = window.set_position(position);
    }

    Ok(())
}

/// Muestra (o reubica) la guía del área a grabar.
///
/// La ventana cubre el **escritorio virtual completo** y atenúa todo menos la
/// región. Es `guide.html`, que recibe las coordenadas por query params y se
/// dibuja sola: sin IPC no necesita capability, y sin dependencias hay poco que
/// pueda romperse.
///
/// Es click-through, así que no le roba interacción a nada de abajo.
///
/// # Por qué es `async`
///
/// **Crear una ventana desde un comando síncrono cuelga la app.** Un comando
/// síncrono corre en el hilo principal; crear una ventana necesita despachar al
/// event loop, que es ese mismo hilo bloqueado esperando que el comando
/// termine. Se esperan mutuamente para siempre: el `build()` nunca vuelve, el
/// hilo principal queda muerto y desde ahí no se procesa ningún comando más.
///
/// Marcarlo `async` lo saca del hilo principal y el deadlock desaparece.
/// No es cosmético: es la diferencia entre que funcione y que la app se congele.
#[tauri::command]
pub async fn show_region_guide(app: AppHandle, region: Region) -> Result<(), CaptureError> {
    let desktop = desktop_bounds(&app)?;
    let url = guide_url(region, desktop);

    let window = match app.get_webview_window(GUIDE_LABEL) {
        // Ya existe: solo se renavega con las coordenadas nuevas.
        Some(existente) => {
            let _ = existente.navigate(url.parse().map_err(|_| CaptureError::PickerFailed)?);
            existente
        }
        None => WebviewWindowBuilder::new(&app, GUIDE_LABEL, WebviewUrl::App(url.into()))
            .title("Área de grabación")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focused(false)
            .visible(false)
            .build()
            .map_err(|_| CaptureError::PickerFailed)?,
    };

    // Click-through: la guía es informativa, nunca interactiva.
    let _ = window.set_ignore_cursor_events(true);

    let listo = window
        .set_position(PhysicalPosition::new(desktop.x, desktop.y))
        .and_then(|()| window.set_size(PhysicalSize::new(desktop.width, desktop.height)))
        .and_then(|()| window.show());

    if listo.is_err() {
        let _ = window.close();
        return Err(CaptureError::PickerFailed);
    }

    // El panel quedaría DEBAJO del atenuado y se vería oscurecido también. Se
    // sube al mismo plano: es el control de grabación, tiene sentido que flote
    // mientras hay un área armada.
    if let Some(panel) = app.get_webview_window("main") {
        let _ = panel.set_always_on_top(true);
    }

    Ok(())
}

/// URL de la guía con la región y el escritorio en píxeles físicos.
///
/// Viajan por query params en vez de por IPC: así `guide.html` no necesita la
/// API de Tauri, ni capability, ni bundle compartido.
fn guide_url(region: Region, desktop: DesktopBounds) -> String {
    format!(
        "guide.html?x={}&y={}&w={}&h={}&dx={}&dy={}&dw={}&dh={}",
        region.x,
        region.y,
        region.width,
        region.height,
        desktop.x,
        desktop.y,
        desktop.width,
        desktop.height
    )
}

/// Oculta la guía. Idempotente: si no existe, no pasa nada.
///
/// `async` por lo mismo que [`show_region_guide`]: cerrar una ventana también
/// despacha al event loop.
#[tauri::command]
pub async fn hide_region_guide(app: AppHandle) -> Result<(), CaptureError> {
    // El panel vuelve a comportarse como una ventana normal.
    if let Some(panel) = app.get_webview_window("main") {
        let _ = panel.set_always_on_top(false);
    }

    if let Some(window) = app.get_webview_window(GUIDE_LABEL) {
        let _ = window.close();
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

    #[test]
    fn la_url_de_la_guia_lleva_region_y_escritorio() {
        // guide.html no habla IPC: todo lo que necesita viaja acá.
        let url = guide_url(
            Region {
                x: 100,
                y: 50,
                width: 800,
                height: 600,
            },
            DesktopBounds {
                x: 0,
                y: 0,
                width: 3840,
                height: 1080,
            },
        );

        assert_eq!(
            url,
            "guide.html?x=100&y=50&w=800&h=600&dx=0&dy=0&dw=3840&dh=1080"
        );
    }

    #[test]
    fn la_url_soporta_coordenadas_negativas() {
        // El escritorio virtual del usuario arranca en x=-1920: si el signo se
        // perdiera, el atenuado quedaría corrido una pantalla entera.
        let url = guide_url(
            Region {
                x: -1325,
                y: 291,
                width: 766,
                height: 500,
            },
            DesktopBounds {
                x: -1920,
                y: 0,
                width: 3840,
                height: 1080,
            },
        );

        assert!(url.contains("x=-1325"), "{url}");
        assert!(url.contains("dx=-1920"), "{url}");
    }
}
