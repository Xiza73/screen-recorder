import "./App.css";
import { RegionPicker } from "./features/region-picker/RegionPicker";
import { formatDuration } from "./lib/format-duration";
import { DEFAULT_FPS } from "./lib/ipc/recorder";
import { type FfmpegState, useFfmpegStatus } from "./lib/ipc/use-ffmpeg-status";
import { type Recorder, useRecorder } from "./lib/ipc/use-recorder";
import { type RegionSelection, sameRegion, useRegionSelection } from "./lib/ipc/use-region";
import { closeWindow, minimizeWindow } from "./lib/ipc/window";
import { useElapsed } from "./lib/use-elapsed";

export default function App() {
  const ffmpeg = useFfmpegStatus();
  const selection = useRegionSelection();
  const recorder = useRecorder(selection.region);

  const recording = recorder.state.status === "recording";
  const elapsed = useElapsed(recording);

  // En modo selección esta misma ventana ES el overlay: no se dibuja el panel.
  if (selection.picking) {
    return <RegionPicker bounds={selection.picking} onDone={selection.finishPicking} />;
  }

  return (
    <div className="app">
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar__dots" data-tauri-drag-region aria-hidden="true">
          <span className="titlebar__dot" data-tauri-drag-region />
          <span className="titlebar__dot" data-tauri-drag-region />
          <span className="titlebar__dot" data-tauri-drag-region />
        </div>

        {recording ? (
          // Indicador de grabación: requisito, no adorno. security-review § 7.
          <p className="titlebar__label recording">
            <span className="recording__dot" aria-hidden="true" />
            Grabando {formatDuration(elapsed)}
          </p>
        ) : (
          <span className="titlebar__label" data-tauri-drag-region>
            screen recorder
            <span className="titlebar__caret">_</span>
          </span>
        )}

        <div className="titlebar__actions">
          <button
            type="button"
            className="titlebar__button"
            onClick={minimizeWindow}
            aria-label="Minimizar"
          >
            –
          </button>
          <button
            type="button"
            className="titlebar__button titlebar__button--close"
            onClick={closeWindow}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      </header>

      <main className="panel">
        {ffmpeg.status === "ready" ? (
          <RecorderPanel recorder={recorder} selection={selection} elapsed={elapsed} />
        ) : (
          <FfmpegNotice state={ffmpeg} />
        )}
      </main>
    </div>
  );
}

function RecorderPanel({
  recorder,
  selection,
  elapsed,
}: {
  recorder: Recorder;
  selection: RegionSelection;
  elapsed: number;
}) {
  const { state, start, stop } = recorder;
  const { monitors, region, custom, pickMonitor, startPicking } = selection;
  const recording = state.status === "recording";

  return (
    <>
      <span className="label">$ fuente</span>
      <div className="segmented">
        {monitors.map((monitor, i) => (
          <button
            // Los monitores no tienen id estable; la posición sí los distingue.
            key={`${monitor.x},${monitor.y}`}
            type="button"
            className={!custom && sameRegion(region, monitor) ? "seg seg--on" : "seg"}
            onClick={() => pickMonitor(monitor)}
            disabled={recording}
          >
            {monitors.length > 1 ? `pantalla ${i + 1}` : "pantalla"}
          </button>
        ))}
        <button
          type="button"
          className={custom ? "seg seg--on" : "seg"}
          onClick={startPicking}
          disabled={recording}
        >
          área
        </button>
      </div>

      <div className="preview">
        {region
          ? `[ ${region.width}×${region.height} @ ${region.x},${region.y} ]`
          : "[ escritorio completo ]"}
      </div>

      <div className="badges">
        <span className="badge">mp4</span>
        <span className="badge">{DEFAULT_FPS}fps</span>
        <span className="badges__path">~/videos/</span>
      </div>

      {recording ? (
        <button type="button" className="action action--stop" onClick={stop}>
          ■ detener <span className="action__meta">{formatDuration(elapsed)}</span>
        </button>
      ) : (
        <button type="button" className="action" onClick={start}>
          ▸ iniciar grabación
        </button>
      )}

      {state.status === "saved" && <p className="status">guardado · {state.file}</p>}
      {state.status === "error" && (
        <p className="status status--warn">no se pudo completar la grabación</p>
      )}
    </>
  );
}

function FfmpegNotice({ state }: { state: FfmpegState }) {
  switch (state.status) {
    case "checking":
      return <p className="status">buscando ffmpeg…</p>;

    case "ready":
      // Lo cubre RecorderPanel; la rama existe para el chequeo de exhaustividad.
      return null;

    case "missing":
      return (
        <div className="notice notice--warn">
          <p>Falta ffmpeg. Instalalo con:</p>
          <code className="notice__hint">{state.hint}</code>
        </div>
      );

    case "error":
      return <p className="status status--warn">no se pudo verificar ffmpeg</p>;

    default: {
      // Si Rust suma una variante y no se contempla acá, tsc rompe en esta línea.
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
