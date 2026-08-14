import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { getFfmpegStatus } from "./lib/ipc/ffmpeg";
import { startRecording, stopRecording } from "./lib/ipc/recorder";

vi.mock("./lib/ipc/ffmpeg", () => ({
  getFfmpegStatus: vi.fn(),
}));

vi.mock("./lib/ipc/recorder", () => ({
  DEFAULT_FPS: 30,
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
}));

const ffmpegListo = () =>
  vi.mocked(getFfmpegStatus).mockResolvedValue({ status: "ready", version: "8.1" });

describe("App sin ffmpeg", () => {
  it("muestra el comando de instalación en vez del botón de grabar", async () => {
    vi.mocked(getFfmpegStatus).mockResolvedValue({
      status: "missing",
      hint: "winget install Gyan.FFmpeg",
    });

    render(<App />);

    expect(await screen.findByText("winget install Gyan.FFmpeg")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("distingue un IPC roto de un ffmpeg ausente", async () => {
    vi.mocked(getFfmpegStatus).mockRejectedValue(new Error("ipc caído"));

    render(<App />);

    expect(await screen.findByText(/no se pudo verificar/i)).toBeInTheDocument();
  });
});

describe("App con ffmpeg disponible", () => {
  it("ofrece grabar y no muestra el indicador todavía", async () => {
    ffmpegListo();

    render(<App />);

    expect(await screen.findByRole("button", { name: /grabar pantalla/i })).toBeInTheDocument();
    expect(screen.queryByText(/grabando/i)).not.toBeInTheDocument();
  });

  it("muestra el indicador de grabación al empezar", async () => {
    ffmpegListo();
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /grabar pantalla/i }));

    // El indicador visible es un requisito, no un detalle de UX.
    expect(await screen.findByText(/grabando/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /detener/i })).toBeInTheDocument();
  });

  it("informa el archivo guardado al detener", async () => {
    ffmpegListo();
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    vi.mocked(stopRecording).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /grabar pantalla/i }));
    await user.click(await screen.findByRole("button", { name: /detener/i }));

    expect(await screen.findByText(/guardado: demo\.mp4/i)).toBeInTheDocument();
    expect(screen.queryByText(/grabando/i)).not.toBeInTheDocument();
  });

  it("no deja el indicador prendido si falla el arranque", async () => {
    // Si el indicador quedara mostrando "Grabando" con ffmpeg caído, el usuario
    // creería que está grabando y perdería la toma entera.
    ffmpegListo();
    vi.mocked(startRecording).mockRejectedValue(new Error("spawn falló"));
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /grabar pantalla/i }));

    expect(await screen.findByText(/no se pudo completar/i)).toBeInTheDocument();
    expect(screen.queryByText(/grabando/i)).not.toBeInTheDocument();
  });
});
