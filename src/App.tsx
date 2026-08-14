import "./App.css";
import { type FfmpegState, useFfmpegStatus } from "./lib/ipc/use-ffmpeg-status";

export default function App() {
  const ffmpeg = useFfmpegStatus();

  return (
    <main className="app">
      <h1>Screen Recorder</h1>
      <FfmpegBanner state={ffmpeg} />
    </main>
  );
}

function FfmpegBanner({ state }: { state: FfmpegState }) {
  switch (state.status) {
    case "checking":
      return <p className="status">Buscando ffmpeg…</p>;

    case "ready":
      return <p className="status">ffmpeg {state.version} · listo para grabar</p>;

    case "missing":
      return (
        <div className="status status--warn">
          <p>Falta ffmpeg. Instalalo con:</p>
          <code className="hint">{state.hint}</code>
        </div>
      );

    case "error":
      return <p className="status status--warn">No se pudo verificar ffmpeg</p>;

    default: {
      // Si Rust suma una variante y no se contempla acá, tsc rompe en esta línea.
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
