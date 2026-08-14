import { useEffect, useState } from "react";
import { type FfmpegStatus, getFfmpegStatus } from "./ffmpeg";

/**
 * Estado de ffmpeg tal como lo ve la UI.
 *
 * Reutiliza el tipo que viene de Rust y le suma los dos estados que solo existen
 * del lado del cliente: mientras se consulta, y si la consulta falla. Al
 * compartir el discriminante `status`, no hace falta mapear nada en el medio.
 */
export type FfmpegState = FfmpegStatus | { status: "checking" } | { status: "error" };

export function useFfmpegStatus(): FfmpegState {
  const [state, setState] = useState<FfmpegState>({ status: "checking" });

  useEffect(() => {
    // StrictMode corre el efecto dos veces en dev: el flag evita que la
    // respuesta de la primera pasada pise el estado después de desmontar.
    let cancelled = false;

    getFfmpegStatus()
      .then((status) => {
        if (!cancelled) setState(status);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
