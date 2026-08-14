# screen-recorder

## Contexto del proyecto

Grabador de pantalla de escritorio, multiplataforma, construido con **Tauri v2**.
El motor de captura y encoding vive en **Rust**; la UI es **React 19 + TypeScript**.

**Problema que resuelve:** las herramientas de grabación o son web (sin audio de
sistema real, sin selección de región arbitraria, sin atajos globales) o son
pesadas, caras y con cuenta obligatoria. Queremos una app liviana, local y rápida
para grabar demos y tutoriales sin fricción.

**Principio rector: todo local.** Sin cuentas, sin nube, sin telemetría. Las
grabaciones **nunca** salen de la máquina del usuario.

Solo se permiten **dos** conexiones salientes, ambas explícitas y verificadas:

1. El auto-update (Tauri updater, firmado).
2. La descarga de ffmpeg en el primer arranque (HTTPS + hash verificado).

Cualquier tercera conexión saliente es un bug o una feature fuera de alcance.

## Usuarios y alcance (MVP)

**Usuario objetivo:** creadores de contenido y desarrolladores que graban demos,
tutoriales y screencasts.

### Dentro del MVP

| Feature | Nota |
|---|---|
| Captura de pantalla, ventana o **región arbitraria** | La región no es opcional: es requisito de v1 |
| Audio de micrófono | Mezclado con la captura |
| Audio de sistema | Por plataforma: ScreenCaptureKit (macOS), WASAPI loopback (Windows), PipeWire (Linux) |
| Webcam overlay (PiP) | Composición sobre el frame capturado |
| Recorte (trim inicio/fin) + export | Sin editor avanzado. Solo cortar y exportar |
| Atajos globales configurables | Con defaults sensatos ya establecidos, editables por el usuario |
| Auto-update | Tauri updater plugin, firmado |

### Fuera del MVP (no lo construyas salvo que se pida explícitamente)

Timeline multipista, anotaciones/dibujo en vivo, zoom dinámico, subtítulos
automáticos, subida a la nube, cuentas de usuario, plugins de terceros,
transcodificación a formatos exóticos, versión móvil.

## Stack y herramientas

| Capa | Elección |
|---|---|
| Shell de app | Tauri v2 (Rust core + system WebView) |
| UI | React 19 + TypeScript (strict) |
| Bundler | Vite |
| Package manager | **bun** (nunca npm/yarn/pnpm) |
| Captura de pantalla | Rust nativo (`scap` / ScreenCaptureKit / WGC) |
| Captura de audio | Rust nativo (`cpal` + loopback por plataforma) |
| Encoding | `ffmpeg` descargado en el primer arranque (**no** es un sidecar de Tauri) |
| Testing TS | Vitest |
| Testing Rust | `cargo test` |
| Lint/format TS | Biome |
| Lint/format Rust | clippy + rustfmt |

## Comandos clave

```bash
bun install                  # instalar dependencias TS
bun run tauri dev            # dev (Vite + app nativa, hot reload)
bun run tauri build          # bundle de release
bun run test                 # tests TS (Vitest, single run)
bun run test:watch           # Vitest en watch
bun run typecheck            # tsc --noEmit
bun run lint                 # Biome check
bun run format               # Biome check --write
```

```bash
cargo test    --manifest-path src-tauri/Cargo.toml
cargo clippy  --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo fmt     --manifest-path src-tauri/Cargo.toml
```

**Gate obligatorio antes de cada commit:** `bun run lint` + `bun run typecheck` +
`bun run test` + `cargo clippy -- -D warnings` + `cargo test`. Si algo está en
rojo, no se commitea: se reporta la falla.

## Convenciones de código

### TypeScript / React

- TS `strict`. **Cero `any`** — si no sabés el tipo, `unknown` + narrowing.
- `type` para shapes, `interface` solo cuando necesitás extensión declarativa.
- React 19 con React Compiler: **no** escribas `useMemo` / `useCallback` a mano.
- Container / presentational: los componentes de UI no llaman `invoke` directo.
  El acceso a Rust vive en `src/lib/ipc/` y se consume vía hooks.
- Nombres de archivo: `kebab-case.ts`, componentes en `PascalCase.tsx`.

### Rust

- `cargo clippy -- -D warnings` es ley: cero warnings en el merge.
- Los `#[tauri::command]` son una **frontera de confianza**: validan todo input
  antes de tocar el sistema de archivos o el sidecar. Nada de `format!` crudo
  hacia un comando de shell.
- Errores tipados con `thiserror`, propagados a TS como variantes serializables.
  Nada de `unwrap()` / `expect()` en rutas de ejecución.
- Lógica en `src-tauri/src/lib.rs` (`pub fn run()`), no en `main.rs`.

### Tauri v2 — no confundir con v1

- `import { invoke } from '@tauri-apps/api/core'` (v2), **nunca** `/tauri` (v1).
- Eventos: `use tauri::Emitter;` → `app.emit(...)` / `app.emit_to(...)`.
- Permisos vía **capabilities** en `src-tauri/capabilities/*.json`. El
  `allowlist` de v1 no existe.
- Config: raíz `"app"` (no `"tauri"`), `bundle` es top-level,
  `build.frontendDist` / `build.devUrl`.

### Git

- Branch de integración: **`dev`** (default). `master` recibe PRs solo desde `dev`.
- Branches: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`, `test/<slug>`.
- **Conventional Commits**: `<type>(<scope>): <subject>`, imperativo, minúscula,
  sin punto final, subject ≤ 50 chars (72 hard cap).
- Merge siempre con `--no-ff`. **Nunca squash, nunca rebase** sobre el target.
- Sin atribución de IA en los commits.

## Estructura del repositorio

```
screen-recorder/
├── CLAUDE.md                 # este archivo (commiteado)
├── CLAUDE.local.md           # overrides personales (gitignored)
├── .mcp.json                 # servidores MCP compartidos
├── biome.json                # lint + format TS
├── package.json              # scripts: dev, build, test, lint, typecheck
├── vite.config.ts            # config de Vite Y de Vitest (un solo archivo)
├── vitest.setup.ts           # matchers de jest-dom
├── tsconfig.json             # strict + types de vitest/jest-dom
├── index.html
├── .claude/
│   ├── settings.json         # permisos del equipo (commiteado)
│   ├── settings.local.json   # permisos personales (gitignored)
│   ├── commands/             # /revision, /fix-issue, /deploy
│   ├── skills/               # security-review, deploy
│   ├── agents/               # code-reviewer, security-auditor
│   └── hooks/                # format-on-edit.ts
│
├── src/                      # UI React
│   ├── main.tsx              # entry point
│   ├── App.tsx               # shell de la app
│   └── App.test.tsx          # smoke test
│
└── src-tauri/
    ├── Cargo.toml            # crate: screen-recorder / lib: screen_recorder_lib
    ├── tauri.conf.json       # productName, ventana, CSP, bundle
    ├── capabilities/
    │   └── default.json      # permisos por ventana (mínimo privilegio)
    ├── icons/
    └── src/
        ├── main.rs           # llama a screen_recorder_lib::run()
        └── lib.rs            # pub fn run() + invoke_handler
```

**Directorios que se crean cuando la fase los necesita** — no antes:

| Ruta | Cuándo |
|---|---|
| `src/lib/ipc/` | Fase 1 — **ÚNICO** lugar que llama `invoke()` |
| `src/features/` | Fase 1+ — recorder, region-picker, shortcuts, trim |
| `src/components/` | cuando haya un presentational reusable de verdad |
| `src/stores/` | cuando el estado no entre en un componente (Zustand) |
| `src-tauri/src/capture/` | Fase 1 — pantalla, región, webcam |
| `src-tauri/src/audio/` | Fase 1 (mic) / Fase 4 (loopback de sistema) |
| `src-tauri/src/encode/` | Fase 1 — sidecar ffmpeg |

## Integraciones externas

Son dos. Ni una más.

### 1. Auto-update (plugin `updater` de Tauri)

- Endpoint de releases: GitHub Releases.
- Los bundles se firman con clave privada. **La clave nunca entra al repo** — vive
  en el keychain local y en GitHub Secrets (`TAURI_SIGNING_PRIVATE_KEY`).
- La pubkey sí va commiteada en `tauri.conf.json`. Es lo que verifica el update.

### 2. Descarga de ffmpeg en el primer arranque

**No es un sidecar de Tauri.** Los sidecars se declaran en `bundle.externalBin` y
se empaquetan en build time con sufijo de target-triple. Un binario descargado en
runtime no pasa por ese mecanismo: se spawnea desde Rust apuntando a la ruta donde
se bajó. No busques `Command::new_sidecar()` — no aplica acá.

Reglas duras:

| Regla | Por qué |
|---|---|
| URL **HTTPS** y fijada en el código, una por plataforma | Sin TLS, cualquiera en la red te sustituye el binario |
| **SHA-256 verificado** contra un hash commiteado en el repo | Descargar y ejecutar sin verificar es ejecución de código arbitrario. **No es opcional** |
| El hash **no** se descarga del mismo servidor que el binario | Si quien sirve el binario sirve el hash, la verificación no verifica nada |
| Se guarda en el **app data dir**, nunca en una ruta del sistema | No requiere permisos de admin y queda aislado por usuario |
| Fallo de descarga → error **explícito** en la UI | Nada de estado roto silencioso. El usuario tiene que saber por qué no puede grabar |
| Los argumentos se pasan como **array**, nunca interpolados | Ver el skill `security-review`, sección 1 |

El detalle completo de la superficie de ataque está en
`.claude/skills/security-review/SKILL.md`. Leelo antes de tocar este código.

---

No hay backend, ni base de datos, ni auth, ni pagos, ni telemetría. Si una tarea
parece necesitar uno, **frená y preguntá** — probablemente esté fuera de alcance.

## Reglas de trabajo con Claude

### Hacé

- Leé el skill que corresponda **antes** de escribir código: `tauri-v2`,
  `react-19`, `typescript`, `vitest`, `zustand-5`, `tailwind-4`.
- Para git usá los skills `git-flow` (política), `github-pr` (sintaxis `gh`) y
  `delivery-handoff` (ritual de entrega: proponé el commit y **esperá el OK**).
- Corré el gate de lint + tests antes de proponer un commit.
- Validá todo input que cruce la frontera TS → Rust.
- Cuando dudes del alcance, preguntá antes de construir. Este MVP ya es grande.

### No hagas

- **No uses npm, yarn ni pnpm.** Solo bun.
- **No uses APIs de Tauri v1.** La mitad de los ejemplos de internet son v1.
- **No hagas build después de cada cambio.** `tauri build` es lento y casi nunca
  es lo que hace falta; usá `cargo check` o `bun run lint`.
- **No agregues dependencias** para algo que resuelven 20 líneas o la stdlib.
- No metas lógica de negocio en componentes de UI.
- No expandas el alcance del MVP por iniciativa propia.
- No agregues atribución de IA a los commits.
- No commitees claves de firma, `.env`, ni grabaciones de prueba.
