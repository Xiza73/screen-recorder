import { useState } from "react";
import { DEFAULT_FPS, startRecording, stopRecording } from "./recorder";
import type { Region } from "./region";

export type RecorderState =
  | { status: "idle" }
  | { status: "recording"; file: string }
  | { status: "saved"; file: string }
  | { status: "error" };

export type Recorder = {
  state: RecorderState;
  /** `region` en `null` graba el escritorio completo. */
  start: (region: Region | null) => Promise<void>;
  stop: () => Promise<void>;
};

export function useRecorder(): Recorder {
  const [state, setState] = useState<RecorderState>({ status: "idle" });

  async function start(region: Region | null) {
    try {
      const file = await startRecording(DEFAULT_FPS, region);
      setState({ status: "recording", file });
    } catch {
      setState({ status: "error" });
    }
  }

  async function stop() {
    try {
      await stopRecording();
      setState((prev) =>
        prev.status === "recording" ? { status: "saved", file: prev.file } : { status: "idle" },
      );
    } catch {
      setState({ status: "error" });
    }
  }

  return { state, start, stop };
}
