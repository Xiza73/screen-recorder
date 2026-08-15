import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { contentViewport, type Region } from "../../lib/ipc/region";
import {
  anchorOf,
  type CssRect,
  type Handle,
  moveRect,
  type Point,
  rectBetween,
  toCss,
  toPhysical,
} from "./geometry";
import "./region-picker.css";

/** Lado mínimo en píxeles CSS, para no confundir un click suelto con una selección. */
const MIN_SIDE = 8;

const HANDLES: Handle[] = ["nw", "ne", "sw", "se"];

type Viewport = { origin: Point; scale: number };

type Gesture =
  /** Rectángulo nuevo, o redimensión: en ambos casos hay una esquina fija. */
  | { kind: "corner"; anchor: Point }
  /** Mover el rectángulo entero sin cambiarle el tamaño. */
  | { kind: "move"; last: Point };

type Props = {
  /** Región actual, si ya había una elegida. */
  initial?: Region;
  /** Se llama al terminar cada gesto. El overlay **no** se cierra. */
  onChange: (region: Region) => void;
  /** Salir descartando los cambios. */
  onCancel: () => void;
  /** Panel de control, que flota sobre el overlay. */
  children: ReactNode;
};

/**
 * Overlay de selección de área.
 *
 * Se queda abierto: cada gesto aplica la región al instante y podés seguir
 * ajustando sin que nada se recargue. El panel flota encima, así se puede
 * arrancar a grabar sin salir del modo edición.
 */
export function RegionPicker({ initial, onChange, onCancel, children }: Props) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [rect, setRect] = useState<CssRect | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);

  // El viewport se mide una vez, cuando la ventana ya terminó de expandirse.
  useEffect(() => {
    let cancelled = false;

    contentViewport().then((medido) => {
      if (cancelled) return;
      setViewport(medido);
      if (initial) setRect(toCss(initial, medido.origin, medido.scale));
    });

    return () => {
      cancelled = true;
    };
  }, [initial]);

  useEffect(() => {
    const cancelar = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", cancelar);
    return () => window.removeEventListener("keydown", cancelar);
  }, [onCancel]);

  function punto(event: React.PointerEvent): Point {
    return { x: event.clientX, y: event.clientY };
  }

  function empezarNuevo(event: React.PointerEvent) {
    const p = punto(event);
    setGesture({ kind: "corner", anchor: p });
    setRect(rectBetween(p, p));
  }

  function empezarResize(event: React.PointerEvent, handle: Handle) {
    if (!rect) return;
    event.stopPropagation();
    setGesture({ kind: "corner", anchor: anchorOf(rect, handle) });
  }

  function empezarMover(event: React.PointerEvent) {
    event.stopPropagation();
    setGesture({ kind: "move", last: punto(event) });
  }

  function arrastrar(event: React.PointerEvent) {
    if (!gesture) return;
    const p = punto(event);

    if (gesture.kind === "corner") {
      setRect(rectBetween(gesture.anchor, p));
      return;
    }

    setRect((actual) =>
      actual ? moveRect(actual, { x: p.x - gesture.last.x, y: p.y - gesture.last.y }) : actual,
    );
    setGesture({ kind: "move", last: p });
  }

  /** Soltar aplica la región. El overlay sigue abierto para seguir ajustando. */
  function soltar() {
    if (!gesture) return;
    setGesture(null);

    if (!rect || !viewport) return;

    if (rect.width < MIN_SIDE || rect.height < MIN_SIDE) {
      // Un click suelto no puede borrar la selección que ya había.
      setRect(initial ? toCss(initial, viewport.origin, viewport.scale) : null);
      return;
    }

    onChange(toPhysical(rect, viewport.origin, viewport.scale));
  }

  return (
    <div
      className={rect ? "picker" : "picker picker--idle"}
      onPointerDown={empezarNuevo}
      onPointerMove={arrastrar}
      onPointerUp={soltar}
    >
      {rect ? (
        <>
          <div
            className="picker__rect"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            onPointerDown={empezarMover}
          >
            {HANDLES.map((handle) => (
              <div
                key={handle}
                className={`picker__handle picker__handle--${handle}`}
                onPointerDown={(event) => empezarResize(event, handle)}
              />
            ))}
          </div>

          <span className="picker__size" style={{ left: rect.x, top: Math.max(0, rect.y - 26) }}>
            {Math.round(rect.width)}×{Math.round(rect.height)}
          </span>
        </>
      ) : (
        <p className="picker__hint">
          <strong>arrastrá para elegir el área</strong>
          esc para volver
        </p>
      )}

      {/* El panel vive dentro del overlay: se puede ajustar el marco y arrancar
          a grabar sin salir del modo edición. */}
      <div className="picker__panel" onPointerDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
