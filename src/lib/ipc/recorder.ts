import { invoke } from "@tauri-apps/api/core";
import type { Region } from "./region";

/** fps por defecto. Rust valida el rango 1..=120 en `build_args`. */
export const DEFAULT_FPS = 30;

/**
 * Inicia la grabación. `region` en `null` captura el escritorio completo.
 *
 * La ruta de salida NO viaja por acá: la decide Rust (carpeta de Videos +
 * timestamp). Devuelve solo el nombre del archivo, sin la ruta absoluta.
 */
export function startRecording(
  fps: number = DEFAULT_FPS,
  region: Region | null = null,
): Promise<string> {
  return invoke<string>("start_recording", { fps, region });
}

/** Detiene la grabación y cierra el archivo correctamente. */
export function stopRecording(): Promise<void> {
  return invoke<void>("stop_recording");
}
