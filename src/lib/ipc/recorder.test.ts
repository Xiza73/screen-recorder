import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_FPS, startRecording, stopRecording } from "./recorder";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("startRecording", () => {
  it("manda los fps por defecto cuando no se especifican", async () => {
    vi.mocked(invoke).mockResolvedValue("screen-recorder-20260814-120000.mp4");

    const file = await startRecording();

    expect(invoke).toHaveBeenCalledWith("start_recording", { fps: DEFAULT_FPS });
    expect(file).toBe("screen-recorder-20260814-120000.mp4");
  });

  it("respeta los fps que se le pasan", async () => {
    vi.mocked(invoke).mockResolvedValue("x.mp4");

    await startRecording(60);

    expect(invoke).toHaveBeenCalledWith("start_recording", { fps: 60 });
  });
});

describe("stopRecording", () => {
  it("invoca stop_recording sin argumentos", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await stopRecording();

    expect(invoke).toHaveBeenCalledWith("stop_recording");
  });
});
