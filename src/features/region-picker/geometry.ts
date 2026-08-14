export type Point = { x: number; y: number };

/** Rectángulo en píxeles CSS, relativo al overlay. */
export type CssRect = { x: number; y: number; width: number; height: number };

/** Rectángulo en píxeles físicos del escritorio virtual. Lo que consume ffmpeg. */
export type PhysicalRect = { x: number; y: number; width: number; height: number };

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
 * Píxeles CSS del overlay → píxeles físicos del escritorio virtual.
 *
 * Es la función más propensa a errores de todo el feature, y el error no se ve:
 * si te olvidás del `scale`, con la pantalla al 150% grabás una zona corrida y
 * más chica que la que el usuario marcó. No falla, no tira error: graba mal.
 *
 * - `origin` es la posición física del overlay. En multi-monitor puede ser
 *   negativa, porque el escritorio virtual no arranca en (0,0).
 * - `scale` es el `devicePixelRatio` de la pantalla.
 */
export function toPhysical(rect: CssRect, origin: Point, scale: number): PhysicalRect {
  return {
    x: Math.round(origin.x + rect.x * scale),
    y: Math.round(origin.y + rect.y * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
  };
}
