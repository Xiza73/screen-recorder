import { useEffect, useRef, useState } from "react";
import {
  closeOverlay,
  listMonitors,
  type MonitorInfo,
  onRegion,
  onSelectionClosed,
  openOverlay,
  type Region,
  setPanelMode,
} from "./region";

/**
 * Texto legible de un error que vino de Rust.
 *
 * Los errores tipados llegan como `{ kind: "..." }`. Tragarlos en silencio deja
 * una UI que no reacciona y no dice por qué: peor que fallar con un mensaje.
 */
function describir(error: unknown): string {
  if (typeof error === "object" && error !== null && "kind" in error) {
    return String((error as { kind: unknown }).kind);
  }

  return error instanceof Error ? error.message : String(error);
}

export type RegionSelection = {
  monitors: MonitorInfo[];
  /** Región a grabar. `null` solo si no se detectó ningún monitor. */
  region: Region | null;
  /** `true` si la región se recortó a mano y no es un monitor entero. */
  custom: boolean;
  /** `true` mientras el overlay está en modo selección. */
  picking: boolean;
  /** Última falla, para mostrarla en vez de no hacer nada. */
  error: string | null;
  pickMonitor: (monitor: MonitorInfo) => void;
  startPicking: () => void;
  stopPicking: () => void;
  cancelPicking: () => void;
};

export function sameRegion(a: Region | null, b: Region): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function useRegionSelection(recording: boolean): RegionSelection {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [region, setRegion] = useState<Region | null>(null);
  const [custom, setCustom] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previa, setPrevia] = useState<{ region: Region | null; custom: boolean } | null>(null);

  // Estado actual sin generar dependencias: mientras se elige, el overlay
  // maneja su propio rectángulo y volver a mandárselo lo recargaría a mitad
  // del gesto.
  const actual = useRef<{ region: Region | null; custom: boolean }>({ region, custom });
  actual.current = { region, custom };

  const previaRef = useRef<{ region: Region | null; custom: boolean } | null>(null);
  previaRef.current = previa;

  // Arranca en el monitor primario y no en el escritorio virtual completo:
  // con dos pantallas, "todo" son 3840x1080 y eso no lo quiere nadie.
  useEffect(() => {
    let cancelled = false;

    listMonitors()
      .then((detectados) => {
        if (cancelled) return;
        setMonitors(detectados);

        const inicial = detectados.find((m) => m.primary) ?? detectados[0];
        if (inicial) setRegion(toRegion(inicial));
      })
      .catch((fallo) => {
        if (!cancelled) setError(`monitores: ${describir(fallo)}`);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // El overlay avisa cada área nueva por evento.
  useEffect(() => {
    const suscripcion = onRegion((elegida) => {
      setRegion(elegida);
      setCustom(true);
    });

    return () => {
      void suscripcion.then((unlisten) => unlisten());
    };
  }, []);

  // Entrar a elegir abre el overlay UNA vez.
  //
  // Solo se hereda un área que ya se había recortado a mano. Entrar con el
  // monitor entero marcado haría parecer que el área "ya existe": el sentido de
  // `área` es dibujarla desde cero.
  useEffect(() => {
    if (!picking) return;

    const heredada = actual.current.custom ? actual.current.region : null;

    // La app principal se esconde: manda el overlay, con su container adentro.
    void openOverlay(heredada, true)
      .then(() => setPanelMode("hidden"))
      .catch((fallo) => setError(`área: ${describir(fallo)}`));
  }, [picking]);

  // El overlay avisa cuando termina: sus controles viven adentro suyo, porque
  // es fullscreen y cualquier botón en otra ventana quedaría tapado.
  useEffect(() => {
    const suscripcion = onSelectionClosed((keep) => {
      setPicking(false);
      void setPanelMode("panel").catch(() => {});

      if (!keep && previaRef.current) {
        setRegion(previaRef.current.region);
        setCustom(previaRef.current.custom);
      }
      setPrevia(null);
    });

    return () => {
      void suscripcion.then((unlisten) => unlisten());
    };
  }, []);

  // Fuera del modo selección, el atenuado solo se justifica MIENTRAS SE GRABA:
  // ahí marca qué entra en la toma. Con el panel abierto no informa nada —la
  // miniatura ya muestra qué se captura— y deja el escritorio oscurecido de
  // gusto. Se cierra al terminar.
  //
  // Click-through siempre: el usuario tiene que poder seguir usando justo lo
  // que está grabando.
  useEffect(() => {
    if (picking) return;

    const debeAtenuar = recording && custom && region !== null;
    const accion = debeAtenuar ? openOverlay(region, false) : closeOverlay();

    void accion.catch((fallo) => setError(`atenuado: ${describir(fallo)}`));
  }, [picking, recording, custom, region]);

  return {
    monitors,
    region,
    custom,
    picking,
    error,

    pickMonitor: (monitor) => {
      setRegion(toRegion(monitor));
      setCustom(false);
      setPicking(false);
    },

    startPicking: () => {
      setError(null);
      setPrevia({ region, custom });
      setPicking(true);
    },

    stopPicking: () => {
      setPicking(false);
      setPrevia(null);
    },

    cancelPicking: () => {
      setPicking(false);
      if (previa) {
        setRegion(previa.region);
        setCustom(previa.custom);
      }
      setPrevia(null);
    },
  };
}

function toRegion({ x, y, width, height }: MonitorInfo): Region {
  return { x, y, width, height };
}
