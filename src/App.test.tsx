import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { getFfmpegStatus } from "./lib/ipc/ffmpeg";
import { chooseOutputDir, outputDir, revealOutputDir } from "./lib/ipc/output";
import { startRecording, stopRecording } from "./lib/ipc/recorder";
import {
  contentViewport,
  enterRegionMode,
  exitRegionMode,
  hideRegionGuide,
  listMonitors,
  previewFrame,
  showRegionGuide,
} from "./lib/ipc/region";
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
  showRegionGuide: vi.fn(),
  hideRegionGuide: vi.fn(),
  previewFrame: vi.fn(),
  contentViewport: vi.fn(),
}));
vi.mock("./lib/ipc/output", () => ({
  outputDir: vi.fn(),
  chooseOutputDir: vi.fn(),
  revealOutputDir: vi.fn(),
}));

const PANTALLA_1 = { x: 0, y: 0, width: 1920, height: 1080, primary: true };
const PANTALLA_2 = { x: 1920, y: 0, width: 1920, height: 1080, primary: false };
const REGION_1 = { x: 0, y: 0, width: 1920, height: 1080 };
const ESCRITORIO = { x: 0, y: 0, width: 3840, height: 1080 };

beforeEach(() => {
  vi.mocked(listMonitors).mockResolvedValue([PANTALLA_1, PANTALLA_2]);
  vi.mocked(enterRegionMode).mockResolvedValue(ESCRITORIO);
  vi.mocked(exitRegionMode).mockResolvedValue(undefined);
  vi.mocked(showRegionGuide).mockResolvedValue(undefined);
  vi.mocked(hideRegionGuide).mockResolvedValue(undefined);
  vi.mocked(previewFrame).mockRejectedValue(new Error("sin miniatura en tests"));
  vi.mocked(contentViewport).mockResolvedValue({ origin: { x: 0, y: 0 }, scale: 1 });
  vi.mocked(outputDir).mockResolvedValue("C:\\Users\\dan\\Videos");
  vi.mocked(revealOutputDir).mockResolvedValue(undefined);
  vi.mocked(chooseOutputDir).mockResolvedValue(null);
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

  it("el botón de área convierte la ventana en overlay sin esconder el panel", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^área$/i }));

    expect(enterRegionMode).toHaveBeenCalledOnce();
    expect(await screen.findByText(/arrastrá para elegir el área/i)).toBeInTheDocument();

    // El panel flota sobre el overlay: se puede seguir ajustando el marco y
    // arrancar a grabar sin salir del modo edición.
    expect(await botonGrabar()).toBeInTheDocument();
  });

  it("elegir una pantalla sale del modo edición", async () => {
    // Sin esto el overlay queda puesto, sin controles y sin forma de volver.
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^área$/i }));
    await screen.findByText(/arrastrá para elegir/i);

    await user.click(screen.getByRole("button", { name: /pantalla 2/i }));

    expect(exitRegionMode).toHaveBeenCalledOnce();
    expect(screen.queryByText(/arrastrá para elegir/i)).not.toBeInTheDocument();
  });

  it("el overlay conserva la barra de título", async () => {
    // Es la salida de emergencia: nunca puede faltar.
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^área$/i }));
    await screen.findByText(/arrastrá para elegir/i);

    expect(screen.getByRole("button", { name: /cerrar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /minimizar/i })).toBeInTheDocument();
  });

  it("arrancar a grabar sale del modo edición", async () => {
    // El marco solo deja de ser editable cuando empieza la grabación.
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^área$/i }));
    await screen.findByText(/arrastrá para elegir/i);

    await user.click(await botonGrabar());

    expect(exitRegionMode).toHaveBeenCalledOnce();
    expect(startRecording).toHaveBeenCalled();
    expect(screen.queryByText(/arrastrá para elegir/i)).not.toBeInTheDocument();
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

describe("carpeta de salida", () => {
  it("muestra la carpeta real, acortada, con la ruta completa en el tooltip", async () => {
    // El badge decía `~/videos/` hardcodeado: no era la carpeta real.
    render(<App />);

    const boton = await screen.findByRole("button", { name: /Videos/ });
    expect(boton).toHaveAttribute("title", "C:\\Users\\dan\\Videos");
  });

  it("abre la carpeta en el explorador", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Videos/ }));

    expect(revealOutputDir).toHaveBeenCalledWith("C:\\Users\\dan\\Videos");
  });

  it("cambia la carpeta con el diálogo nativo", async () => {
    vi.mocked(chooseOutputDir).mockResolvedValue("D:\\demos");
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /cambiar/i }));

    expect(chooseOutputDir).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: /demos/ })).toBeInTheDocument();
  });

  it("cancelar el diálogo deja la carpeta como estaba", async () => {
    vi.mocked(chooseOutputDir).mockResolvedValue(null);
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /cambiar/i }));

    expect(await screen.findByRole("button", { name: /Videos/ })).toBeInTheDocument();
  });
});

describe("previsualización", () => {
  it("avisa mientras genera la miniatura", async () => {
    // Generar el frame lanza un ffmpeg y tarda cientos de ms: sin señal, el
    // recuadro parece roto durante ese rato.
    vi.mocked(previewFrame).mockReturnValue(new Promise(() => {}));

    render(<App />);

    // El recuadro se monta antes de que corra el efecto que pide el frame:
    // hay que esperar a que la carga arranque, no solo a que exista el nodo.
    const recuadro = await screen.findByLabelText(/vista previa/i);
    await waitFor(() => expect(recuadro).toHaveAttribute("aria-busy", "true"));
  });

  it("muestra las medidas aunque la miniatura falle", async () => {
    vi.mocked(previewFrame).mockRejectedValue(new Error("sin ffmpeg"));

    render(<App />);

    expect(await screen.findByText(/1920×1080 @ 0,0/)).toBeInTheDocument();
    expect(await screen.findByLabelText(/vista previa/i)).toHaveAttribute("aria-busy", "false");
  });
});

describe("guía del área", () => {
  it("no dibuja marco para un monitor entero", async () => {
    // Una pantalla completa no necesita que le marquen el contorno.
    render(<App />);
    await screen.findByText(/1920×1080 @ 0,0/);

    expect(showRegionGuide).not.toHaveBeenCalled();
    expect(hideRegionGuide).toHaveBeenCalled();
  });

  it("no deja el marco puesto mientras se elige el área", async () => {
    // Durante la selección estorba: el overlay ya dibuja su propio rectángulo.
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^área$/i }));
    await screen.findByText(/arrastrá para elegir/i);

    expect(showRegionGuide).not.toHaveBeenCalled();
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
