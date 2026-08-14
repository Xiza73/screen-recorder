import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    rollupOptions: {
      // guide.html es una página suelta, sin JS ni bundle compartido: solo
      // dibuja el borde del área que se está grabando.
      input: { main: "index.html", guide: "guide.html" },
    },
  },

  // Opciones para Tauri: solo aplican en `tauri dev` / `tauri build`.
  // 1. no tapar los errores de Rust
  clearScreen: false,
  // 2. Tauri espera un puerto fijo; si no está libre, que falle
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    // 3. no observar src-tauri: lo recompila cargo, no Vite
    watch: { ignored: ["**/src-tauri/**"] },
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // historial de llamadas limpio entre tests, sin perder implementaciones
    clearMocks: true,
  },
});
