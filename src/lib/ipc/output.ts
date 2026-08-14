import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";

/** Carpeta donde se guardan las grabaciones, ruta absoluta. */
export function outputDir(): Promise<string> {
  return invoke<string>("output_dir");
}

/**
 * Abre el diálogo nativo de carpetas y guarda la elección.
 *
 * La ruta la elige el usuario en el explorador del sistema, no la escribe el
 * frontend. Rust igual valida que exista y sea un directorio antes de aceptarla.
 * Devuelve `null` si se canceló.
 */
export async function chooseOutputDir(): Promise<string | null> {
  const elegida = await open({ directory: true, multiple: false });
  if (typeof elegida !== "string") return null;

  return invoke<string>("set_output_dir", { path: elegida });
}

/** Abre la carpeta en el explorador del sistema. */
export function revealOutputDir(dir: string): Promise<void> {
  return openPath(dir);
}
