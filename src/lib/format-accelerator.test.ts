import { formatAccelerator } from "./format-accelerator";

describe("formatAccelerator", () => {
  it("usa símbolos y sin separadores en macOS", () => {
    expect(formatAccelerator("CmdOrCtrl+Shift+R", true)).toBe("⌘⇧R");
  });

  it("usa nombres y signos más en el resto", () => {
    expect(formatAccelerator("CmdOrCtrl+Shift+R", false)).toBe("Ctrl+Shift+R");
  });

  it("distingue Cmd de CmdOrCtrl fuera de macOS", () => {
    // `Cmd` a secas es la tecla Windows, no Ctrl: traducirlas igual mentiría
    // sobre qué hay que apretar.
    expect(formatAccelerator("Cmd+Shift+R", false)).toBe("Win+Shift+R");
    expect(formatAccelerator("CmdOrCtrl+Shift+R", false)).toBe("Ctrl+Shift+R");
  });

  it("respeta las teclas que no son modificadores", () => {
    expect(formatAccelerator("Ctrl+F9", false)).toBe("Ctrl+F9");
    expect(formatAccelerator("Alt+Space", false)).toBe("Alt+Space");
  });

  it("pone en mayúscula las teclas de un solo caracter", () => {
    expect(formatAccelerator("Ctrl+r", false)).toBe("Ctrl+R");
  });
});
