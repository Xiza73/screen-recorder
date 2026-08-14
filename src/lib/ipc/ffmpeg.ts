import { invoke } from "@tauri-apps/api/core";

/**
 * Espejo de `FfmpegStatus` en `src-tauri/src/encode/mod.rs`.
 *
 * Rust lo serializa con `#[serde(tag = "status", rename_all = "camelCase")]`,
 * así que llega como unión discriminada. Modelarlo con campos opcionales en vez
 * de una unión haría que `state.version` compile en la rama `missing`.
 *
 * Si cambia el enum de Rust, este tipo se actualiza acá y `tsc --noEmit` marca
 * a todos los consumidores rotos. Ese es el punto de tener una sola frontera.
 */
export type FfmpegStatus =
  | { status: "ready"; version: string }
  | { status: "missing"; hint: string };

/** Consulta si ffmpeg está disponible en el sistema. */
export function getFfmpegStatus(): Promise<FfmpegStatus> {
  return invoke<FfmpegStatus>("ffmpeg_status");
}
