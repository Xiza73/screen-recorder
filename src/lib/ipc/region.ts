import { invoke } from "@tauri-apps/api/core";

/** Espejo de `Region` en src-tauri/src/capture/mod.rs. Píxeles físicos. */
export type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Espejo de `MonitorInfo` en picker.rs. Un monitor es una región más. */
export type MonitorInfo = Region & { primary: boolean };

/** Espejo de `DesktopBounds`: el escritorio virtual en píxeles físicos. */
export type DesktopBounds = Region;

/** Monitores conectados. */
export function listMonitors(): Promise<MonitorInfo[]> {
  return invoke<MonitorInfo[]>("list_monitors");
}

/**
 * Expande esta ventana para cubrir el escritorio virtual y la pone al frente.
 *
 * No se abre una segunda ventana: la principal se convierte en el overlay.
 * Devuelve los límites físicos, que el frontend necesita para convertir el
 * rectángulo dibujado en píxeles CSS.
 */
export function enterRegionMode(): Promise<DesktopBounds> {
  return invoke<DesktopBounds>("enter_region_mode");
}

/** Devuelve la ventana a su geometría de panel. */
export function exitRegionMode(): Promise<void> {
  return invoke<void>("exit_region_mode");
}
