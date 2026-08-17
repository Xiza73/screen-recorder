import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Espejo de `ShortcutStatus` en src-tauri/src/shortcuts.rs. */
export type ShortcutStatus = {
  accelerator: string;
  /** `false` si otra app ya tenía el atajo tomado. */
  registered: boolean;
};

/** Atajo activo y si se pudo registrar. */
export function shortcutStatus(): Promise<ShortcutStatus> {
  return invoke<ShortcutStatus>("shortcut_status");
}

/**
 * El atajo global pide alternar grabación.
 *
 * Rust solo avisa que se apretó; si eso significa empezar o detener lo decide
 * el frontend, que es el único que conoce el estado. Decidirlo en los dos lados
 * serían dos fuentes de verdad.
 */
export function onShortcutToggle(handler: () => void): Promise<UnlistenFn> {
  return listen("shortcut-toggle", () => handler());
}
