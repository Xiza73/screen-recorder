/**
 * Acorta una ruta a sus últimos segmentos, para mostrarla en poco espacio.
 *
 * `C:\Users\dan\Videos\demos` → `…\Videos\demos`
 *
 * La ruta completa va en el `title` del elemento: se acorta lo que se ve, no lo
 * que se sabe.
 */
export function shortenPath(path: string, segments = 2): string {
  const partes = path.split(/[\\/]+/).filter(Boolean);
  if (partes.length <= segments) return path;

  const separador = path.includes("\\") ? "\\" : "/";

  return `…${separador}${partes.slice(-segments).join(separador)}`;
}
