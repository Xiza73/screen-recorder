import { useEffect, useState } from "react";
import { chooseOutputDir, outputDir, revealOutputDir } from "./output";

export type OutputFolder = {
  /** Ruta absoluta, o `null` mientras se consulta. */
  dir: string | null;
  /** Abre el diálogo nativo para cambiarla. */
  change: () => Promise<void>;
  /** La abre en el explorador del sistema. */
  reveal: () => Promise<void>;
};

export function useOutputDir(): OutputFolder {
  const [dir, setDir] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    outputDir()
      .then((actual) => {
        if (!cancelled) setDir(actual);
      })
      .catch(() => {
        // Se sigue pudiendo grabar: Rust resuelve la carpeta por su cuenta.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    dir,

    change: async () => {
      const elegida = await chooseOutputDir().catch(() => null);
      if (elegida) setDir(elegida);
    },

    reveal: async () => {
      if (!dir) return;
      await revealOutputDir(dir).catch(() => {});
    },
  };
}
