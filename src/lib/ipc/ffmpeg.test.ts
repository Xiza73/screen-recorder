import { invoke } from "@tauri-apps/api/core";
import { getFfmpegStatus } from "./ffmpeg";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("getFfmpegStatus", () => {
  it("invoca el comando ffmpeg_status sin argumentos", async () => {
    vi.mocked(invoke).mockResolvedValue({ status: "ready", version: "8.1" });

    const status = await getFfmpegStatus();

    expect(invoke).toHaveBeenCalledWith("ffmpeg_status");
    expect(status).toEqual({ status: "ready", version: "8.1" });
  });

  it("propaga el rechazo en vez de tragárselo", async () => {
    // Si esta capa devolviera un fallback silencioso, la UI mostraría
    // "ffmpeg no instalado" cuando el problema real es que el IPC está roto.
    vi.mocked(invoke).mockRejectedValue(new Error("ipc caído"));

    await expect(getFfmpegStatus()).rejects.toThrow("ipc caído");
  });
});
