import { anchorOf, moveRect, rectBetween, toCss, toPhysical } from "./geometry";

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

describe("toCss", () => {
  it("es la vuelta exacta de toPhysical", () => {
    // Si no lo fuera, editar un área la movería sola al abrir el selector.
    const origen = { x: -1920, y: -200 };
    const original = { x: 100, y: 50, width: 800, height: 600 };

    const fisico = toPhysical(original, origen, 1.5);
    const vuelta = toCss(fisico, origen, 1.5);

    expect(vuelta).toEqual(original);
  });
});

describe("anchorOf", () => {
  const rect = { x: 100, y: 50, width: 800, height: 600 };

  it("devuelve la esquina opuesta a la que se arrastra", () => {
    // Al tirar de una esquina, la de enfrente es la que NO se mueve.
    expect(anchorOf(rect, "nw")).toEqual({ x: 900, y: 650 });
    expect(anchorOf(rect, "se")).toEqual({ x: 100, y: 50 });
    expect(anchorOf(rect, "ne")).toEqual({ x: 100, y: 650 });
    expect(anchorOf(rect, "sw")).toEqual({ x: 900, y: 50 });
  });

  it("con su ancla y el cursor se reconstruye el rectángulo", () => {
    // Arrastrar la esquina `se` hasta (500,300) deja el mismo origen y un
    // tamaño nuevo: es todo lo que necesita el redimensionado.
    const ancla = anchorOf(rect, "se");

    expect(rectBetween(ancla, { x: 500, y: 300 })).toEqual({
      x: 100,
      y: 50,
      width: 400,
      height: 250,
    });
  });
});

describe("moveRect", () => {
  it("desplaza sin cambiar el tamaño", () => {
    const movido = moveRect({ x: 100, y: 50, width: 800, height: 600 }, { x: -30, y: 15 });

    expect(movido).toEqual({ x: 70, y: 65, width: 800, height: 600 });
  });
});
