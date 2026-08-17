import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { getFfmpegStatus } from "./lib/ipc/ffmpeg";
import { chooseOutputDir, outputDir, revealOutputDir } from "./lib/ipc/output";
import { startRecording, stopRecording } from "./lib/ipc/recorder";
import {
  closeOverlay,
  listMonitors,
  onRegion,
  onSelectionClosed,
  onSelectionPlay,
  openOverlay,
  previewFrame,
  type Region,
  setPanelMode,
} from "./lib/ipc/region";
import { closeWindow, minimizeWindow } from "./lib/ipc/window";

vi.mock("./lib/ipc/ffmpeg", () => ({ getFfmpegStatus: vi.fn() }));
vi.mock("./lib/ipc/recorder", () => ({
  DEFAULT_FPS: 30,
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
}));
vi.mock("./lib/ipc/window", () => ({ closeWindow: vi.fn(), minimizeWindow: vi.fn() }));
vi.mock("./lib/ipc/output", () => ({
  outputDir: vi.fn(),
  chooseOutputDir: vi.fn(),
  revealOutputDir: vi.fn(),
}));
vi.mock("./lib/ipc/region", () => ({
  listMonitors: vi.fn(),
  openOverlay: vi.fn(),
  closeOverlay: vi.fn(),
  setPanelMode: vi.fn(),
  onRegion: vi.fn(),
  onSelectionClosed: vi.fn(),
  onSelectionPlay: vi.fn(),
  emitRegion: vi.fn(),
  emitSelectionClosed: vi.fn(),
  emitSelectionPlay: vi.fn(),
  previewFrame: vi.fn(),
  contentViewport: vi.fn(),
}));

const PANTALLA_1 = { x: 0, y: 0, width: 1920, height: 1080, primary: true };
const PANTALLA_2 = { x: 1920, y: 0, width: 1920, height: 1080, primary: false };
const REGION_1 = { x: 0, y: 0, width: 1920, height: 1080 };
const AREA = { x: 100, y: 50, width: 800, height: 600 };

/** Handlers que el hook registró, para simular lo que emite el overlay. */
let publicarRegion: ((region: Region) => void) | undefined;
let cerrarSeleccion: ((keep: boolean) => void) | undefined;
let pedirPlay: (() => void) | undefined;

beforeEach(() => {
  publicarRegion = undefined;
  cerrarSeleccion = undefined;
  pedirPlay = undefined;
  vi.mocked(onSelectionPlay).mockImplementation((handler) => {
    pedirPlay = handler;
    return Promise.resolve(() => {});
  });
  vi.mocked(setPanelMode).mockResolvedValue(undefined);
  vi.mocked(onRegion).mockImplementation((handler) => {
    publicarRegion = handler;
    return Promise.resolve(() => {});
  });
  vi.mocked(onSelectionClosed).mockImplementation((handler) => {
    cerrarSeleccion = handler;
    return Promise.resolve(() => {});
  });
  vi.mocked(listMonitors).mockResolvedValue([PANTALLA_1, PANTALLA_2]);
  vi.mocked(openOverlay).mockResolvedValue(undefined);
  vi.mocked(closeOverlay).mockResolvedValue(undefined);
  vi.mocked(previewFrame).mockRejectedValue(new Error("sin miniatura en tests"));
  vi.mocked(outputDir).mockResolvedValue("C:\\Users\\dan\\Videos");
  vi.mocked(revealOutputDir).mockResolvedValue(undefined);
  vi.mocked(chooseOutputDir).mockResolvedValue(null);
  vi.mocked(getFfmpegStatus).mockResolvedValue({ status: "ready", version: "8.1" });
});

const botonGrabar = () => screen.findByRole("button", { name: /iniciar grabación/i });
const botonArea = () => screen.findByRole("button", { name: /^área$/i });

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

  it("no atenúa nada mientras no se grabe", async () => {
    // Con el panel abierto la miniatura ya muestra qué se captura: atenuar solo
    // dejaría el escritorio oscurecido de gusto.
    render(<App />);
    await botonGrabar();

    await waitFor(() => expect(closeOverlay).toHaveBeenCalled());
    expect(openOverlay).not.toHaveBeenCalled();
  });

  it("al detener vuelve al modo área, con el marco editable", async () => {
    // El modo área es un modo en el que se queda: detener no devuelve al panel,
    // devuelve al overlay con el marco editable y su container.
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    vi.mocked(stopRecording).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonArea());
    publicarRegion?.(AREA);
    await screen.findByText(/800×600/);

    pedirPlay?.();
    await waitFor(() => expect(openOverlay).toHaveBeenCalledWith(AREA, false));

    vi.mocked(openOverlay).mockClear();
    await user.click(await screen.findByRole("button", { name: /detener/i }));

    // `true` = interactivo: el área se puede seguir moviendo.
    await waitFor(() => expect(openOverlay).toHaveBeenCalledWith(AREA, true));
    await waitFor(() => expect(setPanelMode).toHaveBeenCalledWith("hidden"));
  });

  it("sin área elegida, detener devuelve el panel completo", async () => {
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    vi.mocked(stopRecording).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonGrabar());
    await user.click(await screen.findByRole("button", { name: /detener/i }));

    await waitFor(() => expect(setPanelMode).toHaveBeenCalledWith("panel"));
  });

  it("lista una opción por monitor y permite grabar el segundo", async () => {
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
});

describe("modo selección de área", () => {
  it("arranca sin área: el monitor elegido no se hereda", async () => {
    // Entrar con el monitor entero marcado haría parecer que el área ya existe.
    // El sentido de `área` es dibujarla desde cero.
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonArea());

    await waitFor(() => expect(openOverlay).toHaveBeenCalledWith(null, true));
  });

  it("esconde la app principal: manda el overlay", async () => {
    // El overlay es fullscreen; dejar la app visible detrás solo genera una
    // ventana que recibe clicks que nunca le llegan.
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonArea());

    await waitFor(() => expect(setPanelMode).toHaveBeenCalledWith("hidden"));
  });

  it("el play del container arranca la grabación", async () => {
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonArea());
    publicarRegion?.(AREA);
    await screen.findByText(/800×600/);

    pedirPlay?.();

    await waitFor(() => expect(startRecording).toHaveBeenCalledWith(30, AREA));
    await waitFor(() => expect(setPanelMode).toHaveBeenCalledWith("bar"));
  });

  it("hereda el área si ya se había recortado una", async () => {
    const user = userEvent.setup();

    render(<App />);
    await botonArea();
    publicarRegion?.(AREA);
    await screen.findByText(/800×600/);

    await user.click(await botonArea());

    await waitFor(() => expect(openOverlay).toHaveBeenCalledWith(AREA, true));
  });

  it("aplica el área que publica el overlay", async () => {
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    const user = userEvent.setup();

    render(<App />);
    await botonGrabar();
    publicarRegion?.(AREA);

    expect(await screen.findByText(/800×600 @ 100,50/)).toBeInTheDocument();

    await user.click(await botonGrabar());
    expect(startRecording).toHaveBeenCalledWith(30, AREA);
  });

  it("salir de la selección sin grabar cierra el atenuado", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonArea());
    publicarRegion?.(AREA);

    vi.mocked(closeOverlay).mockClear();
    cerrarSeleccion?.(true);

    // El área queda elegida, pero sin grabar el atenuado no informa nada.
    await waitFor(() => expect(closeOverlay).toHaveBeenCalled());
    expect(await screen.findByText(/800×600 @ 100,50/)).toBeInTheDocument();
  });

  it("cancelar desde el overlay restaura la fuente anterior", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonArea());
    publicarRegion?.(AREA);
    await screen.findByText(/800×600/);

    cerrarSeleccion?.(false);

    expect(await screen.findByText(/1920×1080 @ 0,0/)).toBeInTheDocument();
  });
});

describe("modo grabación", () => {
  it("reemplaza el panel por la barra chica", async () => {
    // La app completa taparía justo lo que se está grabando.
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonGrabar());

    expect(await screen.findByRole("button", { name: /detener/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^área$/i })).not.toBeInTheDocument();
    await waitFor(() => expect(setPanelMode).toHaveBeenCalledWith("bar"));
  });

  it("al detener vuelve el panel completo", async () => {
    vi.mocked(startRecording).mockResolvedValue("demo.mp4");
    vi.mocked(stopRecording).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonGrabar());
    await user.click(await screen.findByRole("button", { name: /detener/i }));

    expect(await screen.findByText(/guardado · demo\.mp4/i)).toBeInTheDocument();
    await waitFor(() => expect(setPanelMode).toHaveBeenCalledWith("panel"));
  });

  it("no deja la barra puesta si falla el arranque", async () => {
    // Si quedara en modo grabación con ffmpeg caído, el usuario creería que
    // está grabando y perdería la toma entera.
    vi.mocked(startRecording).mockRejectedValue(new Error("spawn falló"));
    const user = userEvent.setup();

    render(<App />);
    await user.click(await botonGrabar());

    expect(await screen.findByText(/no se pudo completar/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /detener/i })).not.toBeInTheDocument();
  });
});

describe("carpeta de salida", () => {
  it("muestra la carpeta real, acortada, con la ruta completa en el tooltip", async () => {
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

    expect(await screen.findByRole("button", { name: /demos/ })).toBeInTheDocument();
  });
});

describe("previsualización", () => {
  it("avisa mientras genera la miniatura", async () => {
    // Generar el frame lanza un ffmpeg y tarda cientos de ms: sin señal, el
    // recuadro parece roto durante ese rato.
    vi.mocked(previewFrame).mockReturnValue(new Promise(() => {}));

    render(<App />);

    const recuadro = await screen.findByLabelText(/vista previa/i);
    await waitFor(() => expect(recuadro).toHaveAttribute("aria-busy", "true"));
  });

  it("muestra las medidas aunque la miniatura falle", async () => {
    vi.mocked(previewFrame).mockRejectedValue(new Error("sin ffmpeg"));

    render(<App />);

    expect(await screen.findByText(/1920×1080 @ 0,0/)).toBeInTheDocument();
  });
});
