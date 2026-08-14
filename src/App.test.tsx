import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { getFfmpegStatus } from "./lib/ipc/ffmpeg";
import { startRecording, stopRecording } from "./lib/ipc/recorder";
import { closeWindow, minimizeWindow } from "./lib/ipc/window";

vi.mock("./lib/ipc/ffmpeg", () => ({
  getFfmpegStatus: vi.fn(),
}));

vi.mock("./lib/ipc/recorder", () => ({
  DEFAULT_FPS: 30,
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
}));

vi.mock("./lib/ipc/window", () => ({
  closeWindow: vi.fn(),
  minimizeWindow: vi.fn(),
}));

const ffmpegListo = () =>
  vi.mocked(getFfmpegStatus).mockResolvedValue({ status: "ready", version: "8.1" });

const botonGrabar = () => screen.findByRole("button", { name: /iniciar grabación/i });
const botonDetener = () => screen.findByRole("button", { name: /detener/i });

describe("barra de título", () => {
  it("expone minimizar y cerrar, porque no hay chrome del sistema", async () => {
    ffmpegListo();
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole("button", { name: /minimizar/i }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    expect(minimizeWindow).toHaveBeenCalledOnce();
    expect(closeWindow).toHaveBeenCalledOnce();
  });
});

describe("App sin ffmpeg", () => {
  it("muestra el comando de instalación y no ofrece grabar", async () => {
    vi.mocked(getFfmpegStatus).mockResolvedValue({
      status: "missing",
      hint: "winget install Gyan.FFmpeg",
    });

    render(<App />);

    expect(await screen.findByText("winget install Gyan.FFmpeg")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /iniciar grabación/i })).not.toBeInTheDocument();
  });

  it("distingue un IPC roto de un ffmpeg ausente", async () => {
    vi.mocked(getFfmpegStatus).mockRejectedValue(new Error("ipc caído"));

    render(<App />);

    expect(await screen.findByText(/no se pudo verificar/i)).toBeInTheDocument();
  });
});

describe("App con ffmpeg disponible", () => {
  it("ofrece grabar y todavía no muestra el indicador", async () => {
    ffmpegListo();

    render(<App />);

    expect(await botonGrabar()).toBeInTheDocument();
    expect(screen.queryByText(/grabando/i)).not.toBeInTheDocument();
  });

  it("muestra el indicador y el cronómetro al empezar", async () => {
    ffmpegListo();
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonGrabar());

    // El indicador visible es un requisito de seguridad, no un detalle de UX.
    expect(await screen.findByText(/grabando/i)).toBeInTheDocument();
    expect(await botonDetener()).toBeInTheDocument();
  });

  it("informa el archivo guardado al detener", async () => {
    ffmpegListo();
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    vi.mocked(stopRecording).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonGrabar());
    await user.click(await botonDetener());

    expect(await screen.findByText(/guardado · demo\.mp4/i)).toBeInTheDocument();
    expect(screen.queryByText(/grabando/i)).not.toBeInTheDocument();
  });

  it("no deja el indicador prendido si falla el arranque", async () => {
    // Si el indicador quedara prendido con ffmpeg caído, el usuario creería que
    // está grabando y perdería la toma entera.
    ffmpegListo();
    vi.mocked(startRecording).mockRejectedValue(new Error("spawn falló"));
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonGrabar());

    expect(await screen.findByText(/no se pudo completar/i)).toBeInTheDocument();
    expect(screen.queryByText(/grabando/i)).not.toBeInTheDocument();
  });
});
