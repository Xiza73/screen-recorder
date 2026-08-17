import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
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

const REGION_CHANGED = "region-changed";
const SELECTION_CLOSED = "selection-closed";
const SELECTION_PLAY = "selection-play";

/** Qué muestra la ventana principal. Espejo de `PanelMode` en picker.rs. */
export type PanelMode = "panel" | "bar" | "hidden";

/**
 * Cambia qué muestra la ventana principal.
 *
 * - `panel`: la app completa
 * - `bar`: la píldora de controles, abajo al centro de la principal
 * - `hidden`: escondida, porque manda el overlay con su container adentro
 */
export function setPanelMode(mode: PanelMode): Promise<void> {
  return invoke<void>("set_panel_mode", { mode });
}

/** Monitores conectados. */
export function listMonitors(): Promise<MonitorInfo[]> {
  return invoke<MonitorInfo[]>("list_monitors");
}

/**
 * Abre el overlay que atenúa todo menos el área.
 *
 * Es una ventana aparte y **estática**: el panel sigue siendo movible mientras
 * elegís, y podés elegir el área que quedaba justo debajo suyo. Cuando el panel
 * *era* el overlay, ninguna de las dos cosas se podía.
 *
 * `interactive` en `false` lo deja click-through: se ve el atenuado pero se
 * puede seguir usando la máquina, que es lo que hace falta al grabar.
 */
export function openOverlay(region: Region | null, interactive: boolean): Promise<void> {
  return invoke<void>("open_overlay", { region, interactive });
}

/** Cierra el overlay. Idempotente. */
export function closeOverlay(): Promise<void> {
  return invoke<void>("close_overlay");
}

/** Encoge el panel a la barra de grabación, abajo al centro de la principal. */
export function enterRecordingMode(): Promise<void> {
  return invoke<void>("enter_recording_mode");
}

/** Devuelve el panel a su tamaño y posición. */
export function exitRecordingMode(): Promise<void> {
  return invoke<void>("exit_recording_mode");
}

/** Publica el área elegida desde el overlay. */
export function emitRegion(region: Region): Promise<void> {
  return emit(REGION_CHANGED, region);
}

/** Escucha el área elegida, desde el panel. */
export function onRegion(handler: (region: Region) => void): Promise<UnlistenFn> {
  return listen<Region>(REGION_CHANGED, (event) => handler(event.payload));
}

/**
 * El overlay avisa que terminó. `keep` en `false` descarta lo elegido.
 *
 * Los controles viven **dentro** del overlay: es fullscreen, así que cualquier
 * botón en otra ventana quedaría tapado y sin recibir clicks.
 */
export function emitSelectionClosed(keep: boolean): Promise<void> {
  return emit(SELECTION_CLOSED, keep);
}

/** Escucha el cierre del overlay, desde el panel. */
export function onSelectionClosed(handler: (keep: boolean) => void): Promise<UnlistenFn> {
  return listen<boolean>(SELECTION_CLOSED, (event) => handler(event.payload));
}

/** El container del overlay pide arrancar la grabación. */
export function emitSelectionPlay(): Promise<void> {
  return emit(SELECTION_PLAY, null);
}

/** Escucha el play del container, desde el panel. */
export function onSelectionPlay(handler: () => void): Promise<UnlistenFn> {
  return listen(SELECTION_PLAY, () => handler());
}

type Point = { x: number; y: number };

/**
 * Origen y escala del **área de contenido** de esta ventana, en píxeles físicos.
 *
 * Se mide el rectángulo interno y no el externo: en Windows la ventana tiene un
 * marco invisible aunque `decorations` esté en false, así que el contenido
 * arranca unos píxeles adentro. Usar el externo como origen corre el área
 * elegida hacia arriba y a la izquierda.
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

/**
 * Un frame de la región como data URI PNG, para la previsualización.
 *
 * No es en vivo a propósito: sería un segundo encoder corriendo para mostrar
 * una miniatura. Se pide al cambiar de fuente.
 */
export function previewFrame(region: Region | null): Promise<string> {
  return invoke<string>("preview_frame", { region });
}
