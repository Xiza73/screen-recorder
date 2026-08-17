//! Ventanas auxiliares: overlay de selección y modo grabación.
//!
//! Tres piezas separadas, y la separación es el punto:
//!
//! 1. **Overlay** — ventana propia que cubre todas las pantallas y atenúa todo
//!    lo que queda fuera del área. Es estática: nunca se mueve.
//! 2. **Panel** — la ventana principal. Movible **siempre**, incluso mientras se
//!    elige el área. Antes el panel *era* el overlay, y por eso no se podía
//!    mover ni elegir el área que quedaba debajo suyo.
//! 3. **Barra de grabación** — el panel encogido a una píldora mientras graba,
//!    para no taparle al usuario lo que está grabando.
//!
//! Todo acá se maneja en píxeles **físicos**: es lo que reportan los monitores.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindowBuilder, Window,
};

use super::{CaptureError, Region};

/// Overlay de atenuado y selección.
pub const OVERLAY_LABEL: &str = "selection";

/// Tamaño del panel, en píxeles lógicos. Espeja `tauri.conf.json`.
///
/// Se restaura esta constante en vez del tamaño leído antes de cambiar: leer con
/// una medida (`inner_size`/`outer_size`) y escribir con otra (`set_size`) corre
/// la ventana unos píxeles por ciclo, y el desvío se acumula.
const PANEL_WIDTH: f64 = 420.0;
const PANEL_HEIGHT: f64 = 580.0;

/// Barra de grabación: lo mínimo para saber que grabás y poder frenar.
const BAR_WIDTH: f64 = 300.0;
const BAR_HEIGHT: f64 = 56.0;
/// Separación del borde inferior de la pantalla, en píxeles lógicos.
const BAR_MARGIN: f64 = 28.0;

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

/// Posición del panel, para restaurarla al salir del modo grabación.
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

/// Esquina inferior centrada de un monitor, para apoyar la barra de grabación.
fn bar_position(
    monitor: (i32, i32, u32, u32),
    bar: (f64, f64),
    margin: f64,
    scale: f64,
) -> PhysicalPosition<i32> {
    let (mx, my, mw, mh) = monitor;
    let ancho = (bar.0 * scale) as i32;
    let alto = (bar.1 * scale) as i32;
    let borde = (margin * scale) as i32;

    PhysicalPosition::new(mx + (mw as i32 - ancho) / 2, my + mh as i32 - alto - borde)
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

/// URL del overlay: región inicial + dónde apoyar el container de controles.
///
/// Viaja por query params y no por IPC porque es el estado **inicial**: pedirlo
/// con un comando obligaría a renderizar un cuadro vacío mientras llega.
fn overlay_url(region: Option<Region>, primary: DesktopBounds, interactive: bool) -> String {
    let mut url = format!(
        "index.html?overlay=1&interactive={}&px={}&py={}&pw={}&ph={}",
        u8::from(interactive),
        primary.x,
        primary.y,
        primary.width,
        primary.height
    );

    if let Some(r) = region {
        url.push_str(&format!(
            "&x={}&y={}&w={}&h={}",
            r.x, r.y, r.width, r.height
        ));
    }

    url
}

/// Pantalla principal, donde se apoya el container de controles.
fn primary_bounds(app: &AppHandle) -> Result<DesktopBounds, CaptureError> {
    let m = app
        .primary_monitor()
        .ok()
        .flatten()
        .ok_or(CaptureError::PickerFailed)?;

    Ok(DesktopBounds {
        x: m.position().x,
        y: m.position().y,
        width: m.size().width,
        height: m.size().height,
    })
}

/// Qué muestra la ventana principal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PanelMode {
    /// La app completa.
    Panel,
    /// La píldora de controles, abajo al centro de la pantalla principal.
    Bar,
    /// Escondida: manda el overlay, con su propio container adentro.
    Hidden,
}

/// Cambia qué muestra la ventana principal.
///
/// `async` porque mover, redimensionar y mostrar/ocultar despachan al event loop.
#[tauri::command]
pub async fn set_panel_mode(
    window: Window,
    mode: PanelMode,
    saved: tauri::State<'_, PanelGeometry>,
) -> Result<(), CaptureError> {
    if mode == PanelMode::Hidden {
        let _ = window.hide();
        return Ok(());
    }

    if mode == PanelMode::Panel {
        let previa = saved
            .0
            .lock()
            .map_err(|_| CaptureError::StatePoisoned)?
            .take();

        let _ = window.set_always_on_top(false);
        let _ = window.set_size(LogicalSize::new(PANEL_WIDTH, PANEL_HEIGHT));
        if let Some(position) = previa {
            let _ = window.set_position(position);
        }
        let _ = window.show();

        return Ok(());
    }

    // Bar: se recuerda dónde estaba el panel para poder volver.
    let mut slot = saved.0.lock().map_err(|_| CaptureError::StatePoisoned)?;
    if slot.is_none() {
        *slot = window.outer_position().ok();
    }
    drop(slot);

    let principal = window
        .primary_monitor()
        .ok()
        .flatten()
        .ok_or(CaptureError::PickerFailed)?;

    let destino = bar_position(
        (
            principal.position().x,
            principal.position().y,
            principal.size().width,
            principal.size().height,
        ),
        (BAR_WIDTH, BAR_HEIGHT),
        BAR_MARGIN,
        principal.scale_factor(),
    );

    let _ = window.set_size(LogicalSize::new(BAR_WIDTH, BAR_HEIGHT));
    let _ = window.set_position(destino);
    let _ = window.set_always_on_top(true);
    let _ = window.show();

    Ok(())
}

/// Abre (o reubica) el overlay que cubre todas las pantallas.
///
/// `interactive` decide si acepta el mouse: al elegir el área sí, mientras se
/// graba no — así el usuario puede seguir usando lo que está grabando.
///
/// # Por qué es `async`
///
/// **Crear una ventana desde un comando síncrono cuelga la app.** Un comando
/// síncrono corre en el hilo principal; crear una ventana despacha al event
/// loop, que es ese mismo hilo esperando que el comando termine. Se esperan
/// mutuamente para siempre y desde ahí no se procesa ningún comando más.
#[tauri::command]
pub async fn open_overlay(
    app: AppHandle,
    region: Option<Region>,
    interactive: bool,
) -> Result<(), CaptureError> {
    let desktop = desktop_bounds(&app)?;
    let url = overlay_url(region, primary_bounds(&app)?, interactive);

    let window = match app.get_webview_window(OVERLAY_LABEL) {
        Some(existente) => {
            // `Url::parse` exige una URL ABSOLUTA: parsear "index.html?..." falla
            // siempre con RelativeUrlWithoutBase. Se resuelve contra la actual.
            let base = existente.url().map_err(|_| CaptureError::PickerFailed)?;
            let destino = base.join(&url).map_err(|_| CaptureError::PickerFailed)?;

            existente
                .navigate(destino)
                .map_err(|_| CaptureError::PickerFailed)?;
            existente
        }
        None => WebviewWindowBuilder::new(&app, OVERLAY_LABEL, WebviewUrl::App(url.into()))
            .title("Área de grabación")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focused(interactive)
            .visible(false)
            .build()
            .map_err(|_| CaptureError::PickerFailed)?,
    };

    let _ = window.set_ignore_cursor_events(!interactive);

    let listo = window
        .set_position(PhysicalPosition::new(desktop.x, desktop.y))
        .and_then(|()| window.set_size(PhysicalSize::new(desktop.width, desktop.height)))
        .and_then(|()| window.show());

    if listo.is_err() {
        // Nunca dejar una ventana a medio configurar tapando el escritorio.
        let _ = window.close();
        return Err(CaptureError::PickerFailed);
    }

    Ok(())
}

/// Cierra el overlay. Idempotente.
///
/// `async` por lo mismo que [`open_overlay`]: cerrar también despacha al event loop.
#[tauri::command]
pub async fn close_overlay(app: AppHandle) -> Result<(), CaptureError> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
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
        let b = union_bounds(&[(0, 0, 1920, 1080), (1920, 0, 1920, 1080)]).expect("dos monitores");

        assert_eq!((b.x, b.y, b.width, b.height), (0, 0, 3840, 1080));
    }

    #[test]
    fn un_monitor_a_la_izquierda_da_origen_negativo() {
        // El caso de la máquina de referencia, y el que rompe todo si asumís
        // que el escritorio arranca en (0,0).
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
    fn la_barra_queda_abajo_al_centro() {
        let p = bar_position((0, 0, 1920, 1080), (300.0, 56.0), 28.0, 1.0);

        assert_eq!(p.x, 810); // (1920 - 300) / 2
        assert_eq!(p.y, 996); // 1080 - 56 - 28
    }

    #[test]
    fn la_barra_respeta_el_escalado_de_pantalla() {
        // A 150%, una barra de 300x56 lógicos ocupa 450x84 físicos.
        let p = bar_position((0, 0, 2880, 1620), (300.0, 56.0), 28.0, 1.5);

        assert_eq!(p.x, 1215); // (2880 - 450) / 2
        assert_eq!(p.y, 1494); // 1620 - 84 - 42
    }

    #[test]
    fn la_barra_se_apoya_en_la_pantalla_correcta() {
        // Pantalla principal a la derecha: la barra va ahí, no en el origen.
        let p = bar_position((1920, 0, 1920, 1080), (300.0, 56.0), 28.0, 1.0);

        assert_eq!(p.x, 2730);
    }

    const PRIMARIA: DesktopBounds = DesktopBounds {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };

    #[test]
    fn la_url_del_overlay_lleva_region_y_pantalla_principal() {
        let url = overlay_url(
            Some(Region {
                x: -1325,
                y: 291,
                width: 766,
                height: 500,
            }),
            PRIMARIA,
            true,
        );

        assert!(url.contains("interactive=1"), "{url}");
        assert!(url.contains("x=-1325&y=291&w=766&h=500"), "{url}");
        // La principal ubica el container de controles.
        assert!(url.contains("px=0&py=0&pw=1920&ph=1080"), "{url}");
    }

    #[test]
    fn sin_region_el_overlay_arranca_vacio() {
        // Entrar a `área` no hereda ninguna selección: se dibuja desde cero.
        let url = overlay_url(None, PRIMARIA, true);

        assert!(!url.contains("&x="), "{url}");
        assert!(!url.contains("&w="), "{url}");
    }

    #[test]
    fn el_overlay_no_interactivo_lo_dice_en_la_url() {
        let url = overlay_url(None, PRIMARIA, false);

        assert!(url.contains("interactive=0"), "{url}");
    }
}
