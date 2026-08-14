import { useEffect, useState } from "react";
import {
  type DesktopBounds,
  enterRegionMode,
  exitRegionMode,
  listMonitors,
  type MonitorInfo,
  type Region,
} from "./region";

export type RegionSelection = {
  /** Monitores detectados, en el orden que los reporta el sistema. */
  monitors: MonitorInfo[];
  /** Región a grabar. `null` solo si no se detectó ningún monitor. */
  region: Region | null;
  /** `true` si la región se recortó a mano y no es un monitor entero. */
  custom: boolean;
  /** Límites del escritorio mientras el overlay está activo; `null` si no lo está. */
  picking: DesktopBounds | null;
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

  return {
    monitors,
    region,
    custom,
    picking,

    pickMonitor: (monitor) => {
      setRegion(toRegion(monitor));
      setCustom(false);
    },

    startPicking: async () => {
      try {
        setPicking(await enterRegionMode());
      } catch {
        setPicking(null);
      }
    },

    finishPicking: async (elegida) => {
      // Restaurar la ventana SIEMPRE, aunque el usuario haya cancelado: si esto
      // falla el panel queda del tamaño del escritorio, tapando todo.
      await exitRegionMode().catch(() => {});
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
