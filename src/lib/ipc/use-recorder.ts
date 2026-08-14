import { useState } from "react";
import { startRecording, stopRecording } from "./recorder";

export type RecorderState =
  | { status: "idle" }
  | { status: "recording"; file: string }
  | { status: "saved"; file: string }
  | { status: "error" };

export type Recorder = {
  state: RecorderState;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function useRecorder(): Recorder {
  const [state, setState] = useState<RecorderState>({ status: "idle" });

  async function start() {
    try {
      const file = await startRecording();
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
