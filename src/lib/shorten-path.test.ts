import { shortenPath } from "./shorten-path";

describe("shortenPath", () => {
  it("deja los últimos segmentos de una ruta de Windows", () => {
    expect(shortenPath("C:\\Users\\dan\\Videos\\demos")).toBe("…\\Videos\\demos");
  });

  it("deja los últimos segmentos de una ruta POSIX", () => {
    expect(shortenPath("/home/dan/Videos/demos")).toBe("…/Videos/demos");
  });

  it("no toca una ruta que ya es corta", () => {
    expect(shortenPath("/home/dan")).toBe("/home/dan");
    expect(shortenPath("Videos")).toBe("Videos");
  });

  it("respeta cuántos segmentos se piden", () => {
    expect(shortenPath("C:\\Users\\dan\\Videos\\demos", 1)).toBe("…\\demos");
    expect(shortenPath("C:\\Users\\dan\\Videos\\demos", 3)).toBe("…\\dan\\Videos\\demos");
  });

  it("ignora separadores repetidos o finales", () => {
    expect(shortenPath("C:\\Users\\dan\\Videos\\")).toBe("…\\dan\\Videos");
  });
});
