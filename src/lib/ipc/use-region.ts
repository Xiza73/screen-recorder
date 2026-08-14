import { useEffect, useState } from "react";
import {
  type DesktopBounds,
  enterRegionMode,
  exitRegionMode,
  hideRegionGuide,
  listMonitors,
  type MonitorInfo,
  type Region,
  showRegionGuide,
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
  /** Monitores detectados, en el orden que los reporta el sistema. */
  monitors: MonitorInfo[];
  /** Región a grabar. `null` solo si no se detectó ningún monitor. */
  region: Region | null;
  /** `true` si la región se recortó a mano y no es un monitor entero. */
  custom: boolean;
  /** Límites del escritorio mientras el overlay está activo; `null` si no lo está. */
  picking: DesktopBounds | null;
  /** Última falla, para mostrarla en vez de no hacer nada. */
  error: string | null;
  pickMonitor: (monitor: MonitorInfo) => void;
  /** Convierte esta ventana en overlay de selección. */
  startPicking: () => Promise<void>;
  /** Cierra el overlay. Sin `region`, se cancela sin tocar la selección previa. */
  finishPicking: (region?: Region) => Promise<void>;
};

export function sameRegion(a: Region | null, b: Region): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function useRegionSelection(): RegionSelection {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [region, setRegion] = useState<Region | null>(null);
  const [custom, setCustom] = useState(false);
  const [picking, setPicking] = useState<DesktopBounds | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      .catch(() => {
        // Sin monitores detectados se graba el escritorio completo: es peor no
        // poder grabar que grabar de más.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // El marco solo tiene sentido para un área recortada: una pantalla entera no
  // necesita que le dibujen el contorno. Y durante la selección estorba, porque
  // el overlay ya dibuja el suyo.
  useEffect(() => {
    const mostrar = !picking && custom && region !== null;

    const accion = mostrar ? showRegionGuide(region) : hideRegionGuide();

    // Sin marco se puede grabar igual, así que no rompe la app. Pero se avisa:
    // un marco que no aparece y nadie explica es un bug invisible.
    void accion.catch((fallo) => setError(`guía: ${describir(fallo)}`));
  }, [picking, custom, region]);

  return {
    monitors,
    region,
    custom,
    picking,
    error,

    pickMonitor: (monitor) => {
      setRegion(toRegion(monitor));
      setCustom(false);
    },

    startPicking: async () => {
      setError(null);
      try {
        setPicking(await enterRegionMode());
      } catch (fallo) {
        setPicking(null);
        setError(`área: ${describir(fallo)}`);
      }
    },

    finishPicking: async (elegida) => {
      // Restaurar la ventana SIEMPRE, aunque el usuario haya cancelado: si esto
      // falla el panel queda del tamaño del escritorio, tapando todo.
      await exitRegionMode().catch((fallo) => setError(`restaurar: ${describir(fallo)}`));
      setPicking(null);

      if (elegida) {
        setRegion(elegida);
        setCustom(true);
      }
    },
  };
}

function toRegion({ x, y, width, height }: MonitorInfo): Region {
  return { x, y, width, height };
}
