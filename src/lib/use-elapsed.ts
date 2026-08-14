import { useEffect, useState } from "react";

/**
 * Segundos transcurridos desde que `active` pasó a true. Vuelve a 0 al apagarse.
 *
 * Mide contra un timestamp de inicio en vez de incrementar un contador: un
 * `setInterval` acumula desfase y a los 20 minutos el cronómetro miente.
 */
export function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const id = setInterval(() => setSeconds((Date.now() - startedAt) / 1000), 250);

    return () => clearInterval(id);
  }, [active]);

  return seconds;
}
