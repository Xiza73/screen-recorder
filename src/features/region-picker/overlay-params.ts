import type { Region } from "../../lib/ipc/region";

export type OverlayParams = {
  /** `true` si esta ventana es el overlay y no el panel. */
  overlay: boolean;
  /** Área ya elegida, si había una. */
  region: Region | null;
  /** `false` mientras se graba: el overlay solo atenúa, no se puede tocar. */
  interactive: boolean;
  /** Pantalla principal: donde se apoya el container de controles. */
  primary: Region | null;
};

function leerRect(
  params: URLSearchParams,
  claves: [string, string, string, string],
): Region | null {
  const valores = claves.map((clave) => Number(params.get(clave)));

  if (valores.some((v) => !Number.isFinite(v)) || claves.some((c) => params.get(c) === null)) {
    return null;
  }

  const [x, y, width, height] = valores as [number, number, number, number];
  return { x, y, width, height };
}

/**
 * Lee la configuración del overlay de la query string.
 *
 * Viaja por la URL y no por IPC porque es el estado **inicial**: pedirlo con un
 * comando obligaría a renderizar un cuadro vacío mientras llega la respuesta.
 */
export function readOverlayParams(search: string): OverlayParams {
  const params = new URLSearchParams(search);

  return {
    overlay: params.get("overlay") === "1",
    interactive: params.get("interactive") !== "0",
    region: leerRect(params, ["x", "y", "w", "h"]),
    primary: leerRect(params, ["px", "py", "pw", "ph"]),
  };
}
