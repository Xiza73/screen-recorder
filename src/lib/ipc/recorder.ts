import { invoke } from "@tauri-apps/api/core";

/** fps por defecto. Rust valida el rango 1..=120 en `build_args`. */
export const DEFAULT_FPS = 30;

/**
 * Inicia la grabación de pantalla.
 *
 * La ruta de salida NO viaja por acá: la decide Rust (carpeta de Videos +
 * timestamp). Devuelve solo el nombre del archivo, sin la ruta absoluta.
 */
export function startRecording(fps: number = DEFAULT_FPS): Promise<string> {
  return invoke<string>("start_recording", { fps });
}

/** Detiene la grabación y cierra el archivo correctamente. */
export function stopRecording(): Promise<void> {
  return invoke<void>("stop_recording");
}
