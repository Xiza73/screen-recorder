import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

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

/**
 * Origen y escala del **área de contenido** de esta ventana, en píxeles físicos.
 *
 * Se mide el rectángulo interno y no el externo: en Windows la ventana tiene un
 * marco invisible aunque `decorations` esté en false (medido: 436 de externo
 * para 420 de interno), así que el contenido arranca unos 8px adentro. Usar el
 * externo como origen corre la región elegida hacia arriba y a la izquierda.
 *
 * Origen y escala salen del **mismo** rectángulo: así no pueden discrepar.
 */
export async function contentViewport(): Promise<{ origin: Point; scale: number }> {
  const win = getCurrentWindow();
  const [position, size] = await Promise.all([win.innerPosition(), win.innerSize()]);

  return {
    origin: { x: position.x, y: position.y },
    scale: window.innerWidth > 0 ? size.width / window.innerWidth : 1,
  };
}

type Point = { x: number; y: number };

/**
 * Dibuja el marco del área a grabar, por fuera de la región.
 *
 * Es una ventana sin JavaScript (`guide.html`) y click-through: informa, nunca
 * interactúa. Llamarla de nuevo la reubica en vez de abrir otra.
 */
export function showRegionGuide(region: Region): Promise<void> {
  return invoke<void>("show_region_guide", { region });
}

/**
 * Un frame de la región como data URI PNG, para la previsualización.
 *
 * No es en vivo a propósito: sería un segundo encoder corriendo para mostrar
 * una miniatura. Se pide al cambiar de fuente.
 */
export function previewFrame(region: Region | null): Promise<string> {
  return invoke<string>("preview_frame", { region });
}

/** Saca el marco. Idempotente. */
export function hideRegionGuide(): Promise<void> {
  return invoke<void>("hide_region_guide");
}
