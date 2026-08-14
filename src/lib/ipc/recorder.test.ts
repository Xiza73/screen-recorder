import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_FPS, startRecording, stopRecording } from "./recorder";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("startRecording", () => {
  it("manda los fps por defecto y sin región", async () => {
    vi.mocked(invoke).mockResolvedValue("screen-recorder-20260814-120000.mp4");

    const file = await startRecording();

    // `region: null` explícito, no omitido: Rust espera un Option y omitir la
    // clave deja el contrato dependiendo de cómo serialice el cliente.
    expect(invoke).toHaveBeenCalledWith("start_recording", {
      fps: DEFAULT_FPS,
      region: null,
    });
    expect(file).toBe("screen-recorder-20260814-120000.mp4");
  });

  it("respeta los fps que se le pasan", async () => {
    vi.mocked(invoke).mockResolvedValue("x.mp4");

    await startRecording(60);

    expect(invoke).toHaveBeenCalledWith("start_recording", { fps: 60, region: null });
  });

  it("manda la región tal cual, en píxeles físicos", async () => {
    vi.mocked(invoke).mockResolvedValue("x.mp4");
    const region = { x: -1920, y: 0, width: 800, height: 600 };

    await startRecording(30, region);

    expect(invoke).toHaveBeenCalledWith("start_recording", { fps: 30, region });
  });
});

describe("stopRecording", () => {
  it("invoca stop_recording sin argumentos", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await stopRecording();

    expect(invoke).toHaveBeenCalledWith("stop_recording");
  });
});
