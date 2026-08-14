import { rectBetween, toPhysical } from "./geometry";

describe("rectBetween", () => {
  it("arma el rectángulo arrastrando hacia abajo y a la derecha", () => {
    expect(rectBetween({ x: 10, y: 20 }, { x: 110, y: 220 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 200,
    });
  });

  it("da lo mismo arrastrando hacia arriba y a la izquierda", () => {
    // Nadie arrastra siempre en la misma dirección. Sin normalizar, esto daría
    // ancho y alto negativos y el rectángulo no se dibujaría.
    expect(rectBetween({ x: 110, y: 220 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 200,
    });
  });

  it("un click sin arrastre da un rectángulo vacío", () => {
    expect(rectBetween({ x: 50, y: 50 }, { x: 50, y: 50 })).toEqual({
      x: 50,
      y: 50,
      width: 0,
      height: 0,
    });
  });
});

describe("toPhysical", () => {
  const rect = { x: 100, y: 50, width: 800, height: 600 };

  it("sin escalado ni desplazamiento no cambia nada", () => {
    expect(toPhysical(rect, { x: 0, y: 0 }, 1)).toEqual(rect);
  });

  it("aplica el escalado de pantalla", () => {
    // A 150%, lo que el usuario ve como 800 CSS son 1200 píxeles físicos.
    // Olvidarse de esto graba una zona más chica y corrida, sin fallar.
    expect(toPhysical(rect, { x: 0, y: 0 }, 1.5)).toEqual({
      x: 150,
      y: 75,
      width: 1200,
      height: 900,
    });
  });

  it("suma el origen del overlay", () => {
    expect(toPhysical(rect, { x: 1920, y: 0 }, 1)).toEqual({
      x: 2020,
      y: 50,
      width: 800,
      height: 600,
    });
  });

  it("soporta un origen negativo", () => {
    // Monitor a la izquierda del primario: el escritorio virtual no arranca
    // en (0,0) y el overlay tampoco.
    expect(toPhysical(rect, { x: -1920, y: -200 }, 1)).toEqual({
      x: -1820,
      y: -150,
      width: 800,
      height: 600,
    });
  });

  it("devuelve enteros con escalado fraccionario", () => {
    // ffmpeg no acepta un -video_size con decimales.
    const r = toPhysical({ x: 33, y: 17, width: 101, height: 77 }, { x: 0, y: 0 }, 1.25);

    for (const valor of Object.values(r)) {
      expect(Number.isInteger(valor)).toBe(true);
    }
  });
});
