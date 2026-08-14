import "./App.css";
import { type FfmpegState, useFfmpegStatus } from "./lib/ipc/use-ffmpeg-status";
import { type Recorder, useRecorder } from "./lib/ipc/use-recorder";

export default function App() {
  const ffmpeg = useFfmpegStatus();
  const recorder = useRecorder();

  return (
    <main className="app">
      <h1>Screen Recorder</h1>
      {ffmpeg.status === "ready" ? (
        <RecorderControls recorder={recorder} />
      ) : (
        <FfmpegBanner state={ffmpeg} />
      )}
    </main>
  );
}

function RecorderControls({ recorder }: { recorder: Recorder }) {
  const { state, start, stop } = recorder;
  const recording = state.status === "recording";

  return (
    <>
      {/* El indicador de grabación no es decoración: una app que puede grabar
          sin señal visible es spyware. Ver security-review § 7. */}
      {recording && (
        <p className="status recording">
          <span className="dot" aria-hidden="true" />
          Grabando
        </p>
      )}

      <button type="button" onClick={recording ? stop : start}>
        {recording ? "Detener" : "Grabar pantalla"}
      </button>

      {state.status === "saved" && <p className="status">Guardado: {state.file}</p>}
      {state.status === "error" && (
        <p className="status status--warn">No se pudo completar la grabación</p>
      )}
    </>
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
