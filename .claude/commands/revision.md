---
description: Revisión de código de los cambios pendientes (TS + Rust) contra las convenciones del proyecto
argument-hint: "[scope opcional: src/ | src-tauri/ | <archivo>]"
allowed-tools: Read, Glob, Grep, Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(cargo clippy:*), Bash(bun run lint:*), Task
---

# /revision

Revisá los cambios pendientes. Scope: **$ARGUMENTS** (si está vacío, todo el diff contra `dev`).

## Contexto

- Estado: !`git status --short`
- Diff contra la rama de integración: !`git diff dev...HEAD --stat`

## Qué hacer

1. Leé el diff completo del scope indicado.
2. Delegá al agente `code-reviewer` para el análisis a fondo. Es contexto aislado:
   no ensucia esta conversación con el volcado de archivos.
3. Si el diff toca `src-tauri/`, `capabilities/` o el sidecar de ffmpeg, delegá
   **también** al agente `security-auditor`. En este proyecto esa superficie es
   la que realmente puede hacer daño.
4. Sintetizá los hallazgos acá. No repitas el código: reportá ubicación,
   problema y fix concreto.

## Qué buscar (además de lo que traigan los agentes)

- `any` en TypeScript. Cero tolerancia.
- `unwrap()` / `expect()` en rutas de ejecución de Rust.
- `useMemo` / `useCallback` escritos a mano (React 19 tiene compiler).
- APIs de **Tauri v1** coladas: `@tauri-apps/api/tauri`, `emit_all`, `allowlist`.
- `invoke()` llamado desde un componente de UI en vez de `src/lib/ipc/`.
- Dependencias nuevas que resuelven algo que ya hace la stdlib.
- Alcance fuera del MVP definido en `CLAUDE.md`.

## Formato de salida

Agrupá por severidad. Para cada hallazgo: `archivo:línea`, qué está mal, **por qué**
importa, y el fix. Si no hay nada que reportar, decilo en una línea — no inventes
hallazgos para justificar la revisión.

| Severidad | Criterio |
|---|---|
| 🔴 Bloqueante | Rompe, filtra datos, o viola una regla dura de `CLAUDE.md` |
| 🟡 Importante | Deuda técnica real, se arregla antes del merge |
| 🔵 Sugerencia | Mejora opcional, no bloquea |
