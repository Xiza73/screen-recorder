import { useEffect, useState } from "react";
import type { DesktopBounds, Region } from "../../lib/ipc/region";
import { type CssRect, type Point, rectBetween, toPhysical } from "./geometry";
import "./region-picker.css";

/** Lado mínimo en píxeles CSS, para no confundir un click suelto con una selección. */
const MIN_SIDE = 8;

type Props = {
  /** Escritorio virtual en píxeles físicos, tal como lo reportó Rust. */
  bounds: DesktopBounds;
  /** Sin `region`, el usuario canceló. */
  onDone: (region?: Region) => void;
};

export function RegionPicker({ bounds, onDone }: Props) {
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [rect, setRect] = useState<CssRect | null>(null);

  useEffect(() => {
    const cancelar = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDone();
    };

    window.addEventListener("keydown", cancelar);
    return () => window.removeEventListener("keydown", cancelar);
  }, [onDone]);

  function empezar(event: React.PointerEvent) {
    const punto = { x: event.clientX, y: event.clientY };
    setAnchor(punto);
    setRect(rectBetween(punto, punto));
  }

  function arrastrar(event: React.PointerEvent) {
    if (!anchor) return;
    setRect(rectBetween(anchor, { x: event.clientX, y: event.clientY }));
  }

  function soltar() {
    setAnchor(null);

    if (!rect || rect.width < MIN_SIDE || rect.height < MIN_SIDE) {
      setRect(null);
      return;
    }

    // El escalado sale de comparar el ancho físico contra el CSS: así queda
    // bien con cualquier zoom del sistema, sin consultar el devicePixelRatio.
    const scale = bounds.width / window.innerWidth;

    onDone(toPhysical(rect, { x: bounds.x, y: bounds.y }, scale));
  }

  return (
    <div
      className={rect ? "picker" : "picker picker--idle"}
      onPointerDown={empezar}
      onPointerMove={arrastrar}
      onPointerUp={soltar}
    >
      {rect ? (
        <>
          <div
            className="picker__rect"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
          <span className="picker__size" style={{ left: rect.x, top: Math.max(0, rect.y - 26) }}>
            área: {Math.round(rect.width)}×{Math.round(rect.height)}
          </span>
        </>
      ) : (
        <p className="picker__hint">
          <strong>arrastrá para elegir el área</strong>
          esc para cancelar
        </p>
      )}
    </div>
  );
}
