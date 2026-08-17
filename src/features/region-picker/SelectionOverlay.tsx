import { useEffect, useState } from "react";
import {
  contentViewport,
  emitRegion,
  emitSelectionClosed,
  emitSelectionPlay,
  type Region,
} from "../../lib/ipc/region";
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

/** Medidas del container de controles, en píxeles CSS. */
const CARD_WIDTH = 300;
const CARD_BOTTOM = 96;

type Viewport = { origin: Point; scale: number };

type Gesture =
  /** Rectángulo nuevo, o redimensión: en ambos casos hay una esquina fija. */
  | { kind: "corner"; anchor: Point }
  /** Mover el rectángulo entero sin cambiarle el tamaño. */
  | { kind: "move"; last: Point };

type Props = {
  /** Área ya elegida, si había una. */
  initial: Region | null;
  /** `false` mientras se graba: solo atenúa, sin tiradores. */
  interactive: boolean;
  /** Pantalla principal, para apoyar el container abajo al centro. */
  primary: Region | null;
};

/**
 * Overlay que atenúa todo el escritorio menos el área a grabar.
 *
 * Es su propia ventana, estática. El área **no lleva borde**: se distingue por
 * ser la única zona clara. Sin borde no hay nada que se pueda colar en el video
 * si el rectángulo queda corrido un píxel.
 */
export function SelectionOverlay({ initial, interactive, primary }: Props) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [rect, setRect] = useState<CssRect | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [card, setCard] = useState<Point | null>(null);
  const [cardDrag, setCardDrag] = useState<Point | null>(null);

  useEffect(() => {
    const teclas = (event: KeyboardEvent) => {
      if (event.key === "Escape") void emitSelectionClosed(false);
      if (event.key === "Enter") void emitSelectionClosed(true);
    };

    window.addEventListener("keydown", teclas);
    return () => window.removeEventListener("keydown", teclas);
  }, []);

  // El viewport se mide cuando la ventana ya terminó de expandirse, y se vuelve
  // a medir en cada resize: al crearse tiene el tamaño por defecto y calcular
  // una sola vez deja la escala tomada del tamaño equivocado.
  useEffect(() => {
    let cancelled = false;

    async function medir() {
      const medido = await contentViewport();
      if (cancelled) return;

      setViewport(medido);
      setRect((actual) => actual ?? (initial ? toCss(initial, medido.origin, medido.scale) : null));

      // El container se apoya abajo al centro de la pantalla principal, en
      // coordenadas de este overlay. Solo la posición inicial: después lo mueve
      // el usuario adonde quiera.
      if (primary) {
        const p = toCss(primary, medido.origin, medido.scale);
        setCard(
          (actual) =>
            actual ?? { x: p.x + (p.width - CARD_WIDTH) / 2, y: p.y + p.height - CARD_BOTTOM },
        );
      }
    }

    void medir();
    window.addEventListener("resize", medir);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", medir);
    };
  }, [initial, primary]);

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
    const p = punto(event);

    // La tarjeta de controles se mueve dentro del overlay: si te tapa el área
    // que querés marcar, la corrés. No es una ventana, así que nunca queda
    // debajo del atenuado ni le roba clicks a la selección.
    if (cardDrag) {
      setCard((actual) =>
        actual ? { x: actual.x + (p.x - cardDrag.x), y: actual.y + (p.y - cardDrag.y) } : actual,
      );
      setCardDrag(p);
      return;
    }

    if (!gesture) return;

    if (gesture.kind === "corner") {
      setRect(rectBetween(gesture.anchor, p));
      return;
    }

    setRect((actual) =>
      actual ? moveRect(actual, { x: p.x - gesture.last.x, y: p.y - gesture.last.y }) : actual,
    );
    setGesture({ kind: "move", last: p });
  }

  /** Soltar aplica el área. El overlay sigue abierto para seguir ajustando. */
  function soltar() {
    setCardDrag(null);
    if (!gesture) return;
    setGesture(null);

    if (!rect || !viewport) return;

    if (rect.width < MIN_SIDE || rect.height < MIN_SIDE) {
      // Un click suelto no puede borrar la selección que ya había.
      setRect(initial ? toCss(initial, viewport.origin, viewport.scale) : null);
      return;
    }

    void emitRegion(toPhysical(rect, viewport.origin, viewport.scale));
  }

  // Mientras graba, el overlay es solo el atenuado: sin tiradores ni gestos.
  if (!interactive) {
    return (
      <div className="picker">
        {rect ? (
          <div
            className="picker__rect picker__rect--quiet"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
        ) : null}
      </div>
    );
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
          enter para confirmar · esc para cancelar
        </p>
      )}

      {/* El container aparece recién con la primera área, y lleva el play.
          Va dentro del overlay porque es fullscreen: cualquier botón en otra
          ventana quedaría tapado y no recibiría clicks. */}
      {card && rect && rect.width >= MIN_SIDE && rect.height >= MIN_SIDE ? (
        <div
          className="card"
          style={{ left: card.x, top: card.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span
            className="card__grip"
            onPointerDown={(event) => {
              event.stopPropagation();
              setCardDrag(punto(event));
            }}
          >
            ⠿
          </span>
          <span className="card__size">
            {Math.round(rect.width)}×{Math.round(rect.height)}
          </span>
          <button type="button" className="card__ok" onClick={() => emitSelectionPlay()}>
            ▸ grabar
          </button>
          <button
            type="button"
            className="card__cancel"
            title="Salir del modo área (esc)"
            onClick={() => emitSelectionClosed(false)}
          >
            ✕ salir
          </button>
        </div>
      ) : null}
    </div>
  );
}
