import { useEffect, useState } from "react";
import { type ShortcutStatus, shortcutStatus } from "./shortcuts";

/** Atajo activo, o `null` mientras se consulta. */
export function useShortcut(): ShortcutStatus | null {
  const [status, setStatus] = useState<ShortcutStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    shortcutStatus()
      .then((actual) => {
        if (!cancelled) setStatus(actual);
      })
      .catch(() => {
        // Sin atajo se graba igual con el botón: no vale romper por esto.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
