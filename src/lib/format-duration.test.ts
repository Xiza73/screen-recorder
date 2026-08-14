import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("formatea como hh:mm:ss", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(41)).toBe("00:00:41");
    expect(formatDuration(161)).toBe("00:02:41");
    expect(formatDuration(3661)).toBe("01:01:01");
  });

  it("no se rompe con horas largas", () => {
    expect(formatDuration(360_000)).toBe("100:00:00");
  });

  it("trunca y no redondea los segundos parciales", () => {
    // 41.9s todavía es el segundo 41: redondear haría saltar el contador.
    expect(formatDuration(41.9)).toBe("00:00:41");
  });

  it("aguanta entradas inválidas sin devolver NaN", () => {
    expect(formatDuration(-5)).toBe("00:00:00");
    expect(formatDuration(Number.NaN)).toBe("00:00:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("00:00:00");
  });
});
