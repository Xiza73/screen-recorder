export type Point = { x: number; y: number };

/** Rectángulo en píxeles CSS, relativo al área de contenido de la ventana. */
export type CssRect = { x: number; y: number; width: number; height: number };

/** Rectángulo en píxeles físicos del escritorio virtual. Lo que consume ffmpeg. */
export type PhysicalRect = { x: number; y: number; width: number; height: number };

/** Esquina que se está arrastrando al redimensionar. */
export type Handle = "nw" | "ne" | "sw" | "se";

/** Rectángulo entre dos puntos, sin importar hacia dónde se arrastró. */
export function rectBetween(a: Point, b: Point): CssRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Píxeles CSS → píxeles físicos del escritorio virtual.
 *
 * Es la función más propensa a errores de todo el feature, y el error no se ve:
 * si `origin` o `scale` están mal, se graba una zona corrida y nada falla.
 *
 * - `origin` es la posición física del **área de contenido**, no de la ventana.
 * - `scale` sale de ese mismo rectángulo, para que no puedan discrepar.
 */
export function toPhysical(rect: CssRect, origin: Point, scale: number): PhysicalRect {
  return {
    x: Math.round(origin.x + rect.x * scale),
    y: Math.round(origin.y + rect.y * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
  };
}

/** Píxeles físicos → píxeles CSS. La vuelta de [`toPhysical`], para editar. */
export function toCss(rect: PhysicalRect, origin: Point, scale: number): CssRect {
  return {
    x: (rect.x - origin.x) / scale,
    y: (rect.y - origin.y) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

/** Esquina opuesta a `handle`: el ancla que queda fija al redimensionar. */
export function anchorOf(rect: CssRect, handle: Handle): Point {
  const derecha = rect.x + rect.width;
  const abajo = rect.y + rect.height;

  switch (handle) {
    case "nw":
      return { x: derecha, y: abajo };
    case "ne":
      return { x: rect.x, y: abajo };
    case "sw":
      return { x: derecha, y: rect.y };
    case "se":
      return { x: rect.x, y: rect.y };
  }
}

/** Mueve el rectángulo, manteniendo el tamaño. */
export function moveRect(rect: CssRect, delta: Point): CssRect {
  return { ...rect, x: rect.x + delta.x, y: rect.y + delta.y };
}
