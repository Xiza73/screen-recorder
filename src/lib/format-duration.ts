/** Segundos a `hh:mm:ss`, como muestra el diseño. */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;

  const pad = (n: number) => String(n).padStart(2, "0");

  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60].map(pad).join(":");
}
