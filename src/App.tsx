import { useEffect, useRef } from "react";
import "./App.css";
import { formatDuration } from "./lib/format-duration";
import { DEFAULT_FPS } from "./lib/ipc/recorder";
import { onSelectionPlay, setPanelMode } from "./lib/ipc/region";
import { type FfmpegState, useFfmpegStatus } from "./lib/ipc/use-ffmpeg-status";
import { type OutputFolder, useOutputDir } from "./lib/ipc/use-output-dir";
import { usePreview } from "./lib/ipc/use-preview";
import { type Recorder, useRecorder } from "./lib/ipc/use-recorder";
import { type RegionSelection, sameRegion, useRegionSelection } from "./lib/ipc/use-region";
import { closeWindow, minimizeWindow } from "./lib/ipc/window";
import { shortenPath } from "./lib/shorten-path";
import { useElapsed } from "./lib/use-elapsed";

export default function App() {
  const ffmpeg = useFfmpegStatus();
  const recorder = useRecorder();
  const recording = recorder.state.status === "recording";

  const selection = useRegionSelection(recording);
  const folder = useOutputDir();
  const elapsed = useElapsed(recording);

  async function iniciar() {
    selection.stopPicking();
    await recorder.start(selection.region);
    // La píldora reemplaza al container del overlay: misma posición, mismo
    // aspecto, pero es una ventana de verdad y por eso recibe clicks aunque el
    // overlay pase a ser click-through.
    await setPanelMode("bar").catch(() => {});
  }

  async function detener() {
    await recorder.stop();

    // Con un área elegida se vuelve al MODO ÁREA, no al panel: el marco sigue
    // editable y los controles siguen siendo el container. Se sale del modo
    // recién con `esc` o el botón de salir.
    if (selection.custom) {
      selection.startPicking();
      return;
    }

    await setPanelMode("panel").catch(() => {});
  }

  // El container del overlay pide arrancar. Se guarda en un ref para que el
  // listener se registre una sola vez y siempre vea el estado fresco.
  const iniciarRef = useRef(iniciar);
  iniciarRef.current = iniciar;

  useEffect(() => {
    const suscripcion = onSelectionPlay(() => void iniciarRef.current());

    return () => {
      void suscripcion.then((unlisten) => unlisten());
    };
  }, []);

  // Mientras graba, el panel se encoge a una píldora: la app completa taparía
  // justo lo que se está grabando.
  if (recording) {
    return <RecordingBar elapsed={elapsed} onStop={detener} />;
  }

  return (
    <div className="app">
      <Titlebar recording={false} elapsed={0} />

      <main className="panel">
        {ffmpeg.status === "ready" ? (
          <RecorderPanel
            recorder={recorder}
            selection={selection}
            folder={folder}
            onStart={iniciar}
          />
        ) : (
          <FfmpegNotice state={ffmpeg} />
        )}
      </main>
    </div>
  );
}

/**
 * Barra de grabación: el panel encogido mientras graba.
 *
 * Lo mínimo para saber que estás grabando y poder frenar. Arrastrable, porque
 * apoyada abajo al centro puede caer justo sobre lo que se está grabando.
 */
function RecordingBar({ elapsed, onStop }: { elapsed: number; onStop: () => Promise<void> }) {
  return (
    <div className="bar" data-tauri-drag-region>
      {/* Indicador de grabación: requisito, no adorno. security-review § 7. */}
      <span className="recording__dot" aria-hidden="true" />
      <span className="bar__time" data-tauri-drag-region>
        {formatDuration(elapsed)}
      </span>
      <button type="button" className="bar__stop" onClick={onStop}>
        ■ detener
      </button>
    </div>
  );
}

function Titlebar({ recording, elapsed }: { recording: boolean; elapsed: number }) {
  return (
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
  );
}

function RecorderPanel({
  recorder,
  selection,
  folder,
  onStart,
}: {
  recorder: Recorder;
  selection: RegionSelection;
  folder: OutputFolder;
  onStart: () => Promise<void>;
}) {
  const { state } = recorder;
  const { monitors, region, custom, picking, pickMonitor, startPicking } = selection;

  // Sin miniatura mientras se elige: el overlay atenuado saldría en la foto.
  const preview = usePreview(region, !picking);

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
          >
            {monitors.length > 1 ? `pantalla ${i + 1}` : "pantalla"}
          </button>
        ))}
        <button
          type="button"
          className={custom || picking ? "seg seg--on" : "seg"}
          onClick={startPicking}
        >
          área
        </button>
      </div>

      <span className="preview__meta">
        {region
          ? `${region.width}×${region.height} @ ${region.x},${region.y}`
          : "escritorio completo"}
      </span>

      <div
        className={preview.loading ? "preview preview--loading" : "preview"}
        role="img"
        aria-busy={preview.loading}
        aria-label="Vista previa de la captura"
      >
        {preview.frame ? (
          <img className="preview__frame" src={preview.frame} alt="Vista previa de la captura" />
        ) : (
          !preview.loading && <span>sin vista previa</span>
        )}
      </div>

      <div className="badges">
        <span className="badge">mp4</span>
        <span className="badge">{DEFAULT_FPS}fps</span>
      </div>

      <div className="folder">
        <button
          type="button"
          className="folder__path"
          onClick={folder.reveal}
          // La ruta completa vive en el tooltip: se acorta lo que se ve, no lo
          // que se sabe.
          title={folder.dir ?? undefined}
          disabled={!folder.dir}
        >
          {folder.dir ? shortenPath(folder.dir) : "buscando carpeta…"}
        </button>
        <button type="button" className="folder__change" onClick={folder.change}>
          cambiar
        </button>
      </div>

      <button type="button" className="action" onClick={onStart}>
        ▸ iniciar grabación
      </button>

      {selection.error && <p className="status status--warn">falló {selection.error}</p>}
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
