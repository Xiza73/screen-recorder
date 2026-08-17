/**
 * Acelerador de Tauri a texto legible para esta plataforma.
 *
 * `CmdOrCtrl+Shift+R` → `⌘⇧R` en macOS, `Ctrl+Shift+R` en el resto. Tauri usa
 * un formato único para las tres plataformas; mostrarlo crudo obligaría al
 * usuario a traducirlo mentalmente.
 */
export function formatAccelerator(accelerator: string, mac = esMac()): string {
  const partes = accelerator.split("+").map((parte) => traducir(parte.trim(), mac));

  return mac ? partes.join("") : partes.join("+");
}

function traducir(parte: string, mac: boolean): string {
  const clave = parte.toLowerCase();

  if (clave === "cmdorctrl" || clave === "commandorcontrol") return mac ? "⌘" : "Ctrl";
  if (clave === "cmd" || clave === "command" || clave === "super") return mac ? "⌘" : "Win";
  if (clave === "ctrl" || clave === "control") return mac ? "⌃" : "Ctrl";
  if (clave === "shift") return mac ? "⇧" : "Shift";
  if (clave === "alt" || clave === "option") return mac ? "⌥" : "Alt";

  return parte.length === 1 ? parte.toUpperCase() : parte;
}

function esMac(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform ?? "");
}
