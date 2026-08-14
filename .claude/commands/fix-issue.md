---
description: Workflow completo para resolver un bug — reproducir, test que falla, fix, verificar, PR a dev
argument-hint: "<número de issue> | <descripción del bug>"
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(gh issue view:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(bun run test:*), Bash(bun run lint:*), Bash(cargo test:*), Bash(cargo clippy:*), Bash(git checkout:*), Bash(git add:*)
---

# /fix-issue

Resolver: **$ARGUMENTS**

## El orden importa. No lo saltees.

### 1. Entender antes de tocar

Si `$ARGUMENTS` es un número, traé el issue: `gh issue view $1 --comments`.

Antes de escribir una línea, respondé por escrito:

- ¿Cuál es el comportamiento **esperado**?
- ¿Cuál es el comportamiento **observado**?
- ¿En qué capa vive el bug: UI (React), frontera IPC, o core (Rust)?
- ¿Es específico de plataforma? (macOS / Windows / Linux tienen backends de
  captura distintos — un bug de audio de sistema casi nunca es cross-platform)

Si no podés responder las cuatro, **frená y preguntá**. Un fix a ciegas es un
bug nuevo con disfraz.

### 2. Reproducir

Reproducí el fallo antes de arreglarlo. Si no lo podés reproducir, no lo podés
verificar arreglado, y no sabés si lo arreglaste. Es así de simple.

### 3. Branch

```bash
git checkout -b fix/<slug-corto> dev
```

Siempre desde `dev`. Nunca desde `master`.

### 4. Test que falla PRIMERO

Escribí el test que reproduce el bug y confirmá que **falla**:

- Lógica de UI o de la capa IPC → Vitest en `src/`
- Captura, audio, encoding, validación de comandos → `cargo test` en `src-tauri/`

Un test que pasa antes del fix no está probando el bug. Es decoración.

### 5. El fix mínimo

Arreglá **la causa raíz**, no el síntoma. Y arreglá solo eso: nada de refactors
oportunistas mezclados en el mismo diff. Si ves otra cosa para arreglar, anotala
y va en su propio branch.

### 6. Gate verde

```bash
bun run lint && bun run test
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test   --manifest-path src-tauri/Cargo.toml
```

Todo en verde o no hay commit.

### 7. Entrega

Usá el skill `delivery-handoff`: preparás el commit, lo **proponés**, y esperás
el OK antes de ejecutar.

Formato del commit:

```
fix(<scope>): <qué se arregló, imperativo, ≤50 chars>

Closes #<n>
```

PR contra `dev`, nunca contra `master` (skill `github-pr` para la sintaxis).
