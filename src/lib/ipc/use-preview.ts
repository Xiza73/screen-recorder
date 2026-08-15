import { useEffect, useState } from "react";
import { previewFrame, type Region } from "./region";

export type Preview = {
  /** Data URI del último frame, o `null` si no hay. */
  frame: string | null;
  /** `true` mientras ffmpeg genera el frame: la captura tarda ~200-400 ms. */
  loading: boolean;
};

export function usePreview(region: Region | null, enabled: boolean): Preview {
  const [frame, setFrame] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // `region` sale de un useState, así que su identidad solo cambia cuando el
  // rectángulo cambia de verdad. No hace falta derivar una clave.
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setFrame(null);
    setLoading(true);

    previewFrame(region)
      .then((data) => {
        if (!cancelled) setFrame(data);
      })
      .catch(() => {
        // Sin miniatura se graba igual: el recuadro cae a las medidas en texto.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [region, enabled]);

  return { frame, loading };
}
