import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { getFfmpegStatus } from "./lib/ipc/ffmpeg";
import { startRecording, stopRecording } from "./lib/ipc/recorder";
import { enterRegionMode, exitRegionMode, listMonitors } from "./lib/ipc/region";
import { closeWindow, minimizeWindow } from "./lib/ipc/window";

vi.mock("./lib/ipc/ffmpeg", () => ({ getFfmpegStatus: vi.fn() }));
vi.mock("./lib/ipc/recorder", () => ({
  DEFAULT_FPS: 30,
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
}));
vi.mock("./lib/ipc/window", () => ({ closeWindow: vi.fn(), minimizeWindow: vi.fn() }));
vi.mock("./lib/ipc/region", () => ({
  listMonitors: vi.fn(),
  enterRegionMode: vi.fn(),
  exitRegionMode: vi.fn(),
}));

const PANTALLA_1 = { x: 0, y: 0, width: 1920, height: 1080, primary: true };
const PANTALLA_2 = { x: 1920, y: 0, width: 1920, height: 1080, primary: false };
const REGION_1 = { x: 0, y: 0, width: 1920, height: 1080 };
const ESCRITORIO = { x: 0, y: 0, width: 3840, height: 1080 };

beforeEach(() => {
  vi.mocked(listMonitors).mockResolvedValue([PANTALLA_1, PANTALLA_2]);
  vi.mocked(enterRegionMode).mockResolvedValue(ESCRITORIO);
  vi.mocked(exitRegionMode).mockResolvedValue(undefined);
  vi.mocked(getFfmpegStatus).mockResolvedValue({ status: "ready", version: "8.1" });
});

const botonGrabar = () => screen.findByRole("button", { name: /iniciar grabación/i });
const botonDetener = () => screen.findByRole("button", { name: /detener/i });

describe("barra de título", () => {
  it("expone minimizar y cerrar, porque no hay chrome del sistema", async () => {
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

describe("elección de fuente", () => {
  it("arranca en el monitor primario, no en el escritorio entero", async () => {
    // Con dos pantallas, el escritorio virtual son 3840x1080. Nadie quiere eso.
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    const user = userEvent.setup();

    render(<App />);
    expect(await screen.findByText(/1920×1080 @ 0,0/)).toBeInTheDocument();

    await user.click(await botonGrabar());
    expect(startRecording).toHaveBeenCalledWith(30, REGION_1);
  });

  it("lista una opción por monitor conectado", async () => {
    render(<App />);

    expect(await screen.findByRole("button", { name: /pantalla 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pantalla 2/i })).toBeInTheDocument();
  });

  it("permite grabar el segundo monitor", async () => {
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /pantalla 2/i }));
    await user.click(await botonGrabar());

    expect(startRecording).toHaveBeenCalledWith(30, {
      x: 1920,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("con un solo monitor no numera la opción", async () => {
    vi.mocked(listMonitors).mockResolvedValue([PANTALLA_1]);

    render(<App />);

    expect(await screen.findByRole("button", { name: /^pantalla$/i })).toBeInTheDocument();
  });

  it("el botón de área convierte la ventana en overlay", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^área$/i }));

    expect(enterRegionMode).toHaveBeenCalledOnce();
    // El panel desaparece: la ventana entera pasa a ser el selector.
    expect(await screen.findByText(/arrastrá para elegir el área/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /iniciar grabación/i })).not.toBeInTheDocument();
  });

  it("esc sale del overlay y restaura la ventana", async () => {
    // Si `exit_region_mode` no se llamara, el panel quedaría del tamaño del
    // escritorio tapando todo, que es exactamente el bug que tuvimos.
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^área$/i }));
    await screen.findByText(/arrastrá para elegir/i);

    await user.keyboard("{Escape}");

    expect(exitRegionMode).toHaveBeenCalledOnce();
    expect(await botonGrabar()).toBeInTheDocument();
  });

  it("si no se puede entrar en modo selección, no queda a medias", async () => {
    vi.mocked(enterRegionMode).mockRejectedValue(new Error("sin monitores"));
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^área$/i }));

    // Sigue mostrando el panel, no un overlay roto.
    expect(await botonGrabar()).toBeInTheDocument();
  });
});

describe("grabación", () => {
  it("muestra el indicador y el cronómetro al empezar", async () => {
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonGrabar());

    // El indicador visible es un requisito de seguridad, no un detalle de UX.
    expect(await screen.findByText(/grabando/i)).toBeInTheDocument();
    expect(await botonDetener()).toBeInTheDocument();
  });

  it("informa el archivo guardado al detener", async () => {
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
    vi.mocked(startRecording).mockRejectedValue(new Error("spawn falló"));
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonGrabar());

    expect(await screen.findByText(/no se pudo completar/i)).toBeInTheDocument();
    expect(screen.queryByText(/grabando/i)).not.toBeInTheDocument();
  });

  it("no deja cambiar de fuente mientras graba", async () => {
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonGrabar());
    await screen.findByText(/grabando/i);

    expect(screen.getByRole("button", { name: /pantalla 1/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^área$/i })).toBeDisabled();
  });
});
