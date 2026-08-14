import { render, screen } from "@testing-library/react";
import App from "./App";
import { getFfmpegStatus } from "./lib/ipc/ffmpeg";

vi.mock("./lib/ipc/ffmpeg", () => ({
  getFfmpegStatus: vi.fn(),
}));

describe("App", () => {
  it("renderiza el título de la app", () => {
    vi.mocked(getFfmpegStatus).mockResolvedValue({ status: "ready", version: "8.1" });

    render(<App />);

    expect(screen.getByRole("heading", { name: /screen recorder/i })).toBeInTheDocument();
  });

  it("muestra la versión cuando ffmpeg está disponible", async () => {
    vi.mocked(getFfmpegStatus).mockResolvedValue({ status: "ready", version: "8.1" });

    render(<App />);

    expect(await screen.findByText(/ffmpeg 8\.1/)).toBeInTheDocument();
  });

  it("muestra el comando de instalación cuando falta ffmpeg", async () => {
    vi.mocked(getFfmpegStatus).mockResolvedValue({
      status: "missing",
      hint: "winget install Gyan.FFmpeg",
    });

    render(<App />);

    expect(await screen.findByText("winget install Gyan.FFmpeg")).toBeInTheDocument();
  });

  it("distingue un IPC roto de un ffmpeg ausente", async () => {
    // El caso que se olvida: si el IPC falla, decir "falta ffmpeg" sería mentira
    // y mandaría al usuario a instalar algo que ya tiene.
    vi.mocked(getFfmpegStatus).mockRejectedValue(new Error("ipc caído"));

    render(<App />);

    expect(await screen.findByText(/no se pudo verificar/i)).toBeInTheDocument();
  });
});
