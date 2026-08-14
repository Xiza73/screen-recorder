import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Controles de la ventana.
 *
 * La app corre con `decorations: false`, así que el chrome lo dibuja la UI y
 * estos controles reemplazan a los del sistema. Viven acá y no en un componente
 * por la misma regla que el resto de `lib/ipc/`: nada de IPC suelto en la UI.
 */

export function minimizeWindow(): Promise<void> {
  return getCurrentWindow().minimize();
}

export function closeWindow(): Promise<void> {
  return getCurrentWindow().close();
}
