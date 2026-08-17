//! Atajos globales.
//!
//! "Globales" quiere decir que funcionan aunque la app no tenga el foco — que es
//! todo el punto: cuando arrancás a grabar, la ventana que te importa es otra.
//!
//! Rust registra el atajo y emite un evento; quién decide si eso significa
//! empezar o detener es el frontend, que es el único que conoce el estado.
//! Duplicar esa decisión acá seria tener dos fuentes de verdad.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use thiserror::Error;

/// Atajo por defecto para iniciar/detener.
///
/// `CmdOrCtrl` lo traduce el plugin a ⌘ en macOS y Ctrl en el resto.
pub const DEFAULT_TOGGLE: &str = "CmdOrCtrl+Shift+R";

const TOGGLE_EVENT: &str = "shortcut-toggle";

#[derive(Debug, Error, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ShortcutError {
    #[error("el atajo no tiene un formato válido")]
    Invalid,
    #[error("el atajo ya está tomado por otra aplicación")]
    Taken,
}

/// Estado del atajo, para mostrarlo en la UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    /// El acelerador tal cual se registró.
    pub accelerator: String,
    /// `false` si otra app ya lo tenía tomado.
    pub registered: bool,
}

/// Registra el atajo de iniciar/detener.
///
/// No es fatal que falle: otra app puede tener el mismo atajo tomado. En ese
/// caso la app sigue andando y la UI avisa, en vez de no arrancar.
pub fn register_toggle(app: &AppHandle, accelerator: &str) -> Result<(), ShortcutError> {
    let atajo = accelerator
        .parse::<tauri_plugin_global_shortcut::Shortcut>()
        .map_err(|_| ShortcutError::Invalid)?;

    app.global_shortcut()
        .on_shortcut(atajo, |app, _atajo, evento| {
            // El plugin avisa al apretar Y al soltar: sin filtrar, cada pulsación
            // alternaría dos veces y quedaría todo como estaba.
            if evento.state() == ShortcutState::Pressed {
                let _ = app.emit(TOGGLE_EVENT, ());
            }
        })
        .map_err(|_| ShortcutError::Taken)
}

/// Atajo activo y si se pudo registrar.
/// Estado del atajo, guardado al registrarlo.
///
/// Se recuerda el resultado en vez de consultárselo al plugin: es un dato que
/// ya tuvimos en la mano al arrancar, y así no depende de nada más.
#[derive(Default)]
pub struct Shortcuts(std::sync::Mutex<Option<ShortcutStatus>>);

impl Shortcuts {
    pub fn remember(&self, status: ShortcutStatus) {
        if let Ok(mut slot) = self.0.lock() {
            *slot = Some(status);
        }
    }
}

/// Atajo activo y si se pudo registrar.
#[tauri::command]
pub fn shortcut_status(state: tauri::State<'_, Shortcuts>) -> ShortcutStatus {
    state
        .0
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
        .unwrap_or_else(|| ShortcutStatus {
            accelerator: DEFAULT_TOGGLE.to_owned(),
            registered: false,
        })
}
