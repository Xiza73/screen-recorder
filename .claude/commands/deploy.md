---
description: Publicar una release firmada de la app Tauri (bundles + tag + GitHub Release + manifest del updater)
argument-hint: "<patch|minor|major> o <versión exacta, ej. 0.3.0>"
allowed-tools: Read, Edit, Glob, Grep, Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(bun run test:*), Bash(bun run lint:*), Bash(cargo test:*), Bash(cargo clippy:*), Bash(gh run list:*), Bash(gh release:*)
---

# /deploy

Release: **$ARGUMENTS**

> El procedimiento completo vive en el skill **`deploy`** (`.claude/skills/deploy/SKILL.md`).
> Cargalo antes de empezar. Este comando es el disparador, no la documentación.

## Precondiciones — verificá TODAS antes de tocar nada

- [ ] Estás parado en `dev`, con el árbol limpio (`git status`).
- [ ] `dev` tiene todo lo que va en esta release. Confirmalo con `git log master..dev --oneline`.
- [ ] Gate verde: `bun run lint`, `bun run test`, `cargo clippy -- -D warnings`, `cargo test`.
- [ ] `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` disponibles
      en el entorno de build. **Sin firma no hay auto-update**: los clientes viejos
      rechazan el bundle y quedan varados en la versión anterior.

Si alguna falla, **pará y reportá**. No hay release a medias.

## Pasos

1. **Bump de versión** — los tres archivos tienen que quedar idénticos:
   - `package.json` → `version`
   - `src-tauri/tauri.conf.json` → `version`
   - `src-tauri/Cargo.toml` → `[package] version`

2. **Changelog** desde los conventional commits: `git log master..dev --oneline`.
   Agrupá por `feat` / `fix` / resto.

3. **Commit del bump** (proponer y esperar OK, skill `delivery-handoff`):
   ```
   chore(release): v<X.Y.Z>
   ```

4. **PR `dev` → `master`**, merge con `--no-ff`. Nunca squash.

5. **Build de los bundles** desde `master`:
   ```bash
   bun run tauri build
   ```
   macOS `.dmg` / `.app`, Windows `.msi` / `.exe`, Linux `.deb` / `.AppImage`.
   Cada plataforma se buildea en su propio SO — no hay cross-compile real acá.

6. **Tag semver** sobre `master`:
   ```bash
   git tag -a v<X.Y.Z> -m "release: v<X.Y.Z>"
   git push origin v<X.Y.Z>
   ```

7. **GitHub Release** con los bundles y el changelog adjuntos.

8. **Manifest del updater** (`latest.json`) — publicado y apuntando a los assets
   nuevos, con la firma `.sig` de cada bundle. Verificá que el endpoint responda
   antes de dar la release por cerrada.

9. **Smoke test del update**: instalá la versión anterior, abrila, confirmá que
   detecta y aplica el update. Este paso no se saltea. Un updater roto es un
   usuario que nunca más recibe un fix.
