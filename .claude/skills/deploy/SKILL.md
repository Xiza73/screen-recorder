---
name: deploy
description: Procedimiento de release de la app Tauri v2 — bump de versión en los tres archivos, gate de calidad, merge dev a master, bundles firmados por plataforma, tag semver, GitHub Release y manifest del updater. Usar al publicar una versión, cortar una release, firmar bundles o tocar la configuración del updater.
---

# Deploy — screen-recorder

Release de app de escritorio. No es un `git push` a un servidor: acá se firman
binarios que la gente instala en su máquina. Un error se propaga a todos los
usuarios y **no se puede revertir**: solo se puede publicar una versión nueva.

## Precondiciones

| Check | Comando |
|---|---|
| Parado en `dev`, árbol limpio | `git status` |
| `dev` contiene la release completa | `git log master..dev --oneline` |
| Lint + tests TS en verde | `bun run lint && bun run test` |
| Clippy + tests Rust en verde | `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` |
| Claves de firma disponibles | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |

Cualquiera en rojo → se aborta y se reporta. No hay release parcial.

## 1. Bump de versión — los tres archivos, o ninguno

```
package.json                → "version"
src-tauri/tauri.conf.json   → "version"
src-tauri/Cargo.toml        → [package] version
```

Si quedan desalineados, el bundle sale con una versión y el updater compara
contra otra. Resultado: usuarios que nunca reciben el update, o que lo reciben
en loop infinito.

SemVer: `patch` = fix, `minor` = feature compatible, `major` = ruptura (formato
de archivo, esquema de settings o de shortcuts guardados).

## 2. Changelog

Salen de los conventional commits: `git log master..dev --oneline`.
Agrupá en **Features** (`feat`) / **Fixes** (`fix`) / **Otros**. Escribilo para
el usuario final, no para el equipo: "ahora podés grabar una región de pantalla",
no "refactor del módulo de captura".

## 3. Commit del bump y merge a master

```bash
# commit: chore(release): v<X.Y.Z>   (proponer y esperar OK — skill delivery-handoff)
gh pr create --base master --head dev --title "release: v<X.Y.Z>"
gh pr merge <n> --merge   # --no-ff. NUNCA squash: destruye la granularidad de dev
```

## 4. Bundles firmados — uno por plataforma

```bash
bun run tauri build
```

| SO | Artefactos |
|---|---|
| macOS | `.dmg`, `.app` — requiere notarización de Apple para no dar warning al abrir |
| Windows | `.msi`, `.exe` — sin firma de código, SmartScreen asusta al usuario |
| Linux | `.deb`, `.AppImage` |

**No hay cross-compile real en Tauri.** Cada plataforma se buildea en su propio
SO — típicamente una matrix en GitHub Actions.

La firma del updater es distinta de la firma de código del SO. Necesitás las dos:
la del updater para que la app acepte el paquete, la del SO para que el usuario
no vea una alerta de "app no confiable".

## 5. Tag

```bash
git tag -a v<X.Y.Z> -m "release: v<X.Y.Z>"
git push origin v<X.Y.Z>
```

## 6. GitHub Release + manifest del updater

Subí los bundles **y sus archivos `.sig`**. Después publicá el manifest:

```json
{
  "version": "X.Y.Z",
  "notes": "…changelog…",
  "pub_date": "2026-01-01T00:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "<contenido del .sig>", "url": "https://…/app.app.tar.gz" },
    "windows-x86_64": { "signature": "<contenido del .sig>", "url": "https://…/app.msi.zip" },
    "linux-x86_64":   { "signature": "<contenido del .sig>", "url": "https://…/app.AppImage.tar.gz" }
  }
}
```

`signature` es el **contenido** del `.sig`, no la ruta. Es el error más común
y silencioso: el manifest queda válido como JSON y el update falla en todos los
clientes sin decir por qué.

## 7. Smoke test del update — no se saltea

1. Instalá la versión **anterior** en una máquina limpia.
2. Abrila.
3. Confirmá que detecta el update, lo descarga, lo aplica y arranca en la nueva.

Recién ahí la release está cerrada.

## Si algo salió mal

No se borra un tag ni una release publicada: alguien ya la descargó. Se publica
un `patch` nuevo. Si el bundle es peligroso, despublicá el **manifest del updater**
primero (corta la propagación al instante) y después sacá los assets.
