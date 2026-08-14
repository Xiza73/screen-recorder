---
name: security-review
description: Auditoría de seguridad para la app Tauri v2 — resolución del binario de ffmpeg en el PATH y secuestro de PATH, inyección de argumentos al ejecutarlo, capabilities y permisos, validación en la frontera IPC, path traversal al guardar grabaciones, firma del updater y privacidad de la captura. Usar al tocar src-tauri/, capabilities/, tauri.conf.json, el encoder, el updater, o antes de cualquier release.
---

# Security review — screen-recorder (Tauri v2)

Esta app hace tres cosas que la vuelven un objetivo interesante: **captura la
pantalla del usuario**, **escribe archivos arbitrarios en disco**, y **ejecuta un
binario externo (ffmpeg)**. Cada una es una frontera de confianza real.

Revisá en este orden. La superficie más peligrosa primero.

## 1a. ffmpeg — qué binario terminamos ejecutando

La app **no descarga ni empaqueta** ffmpeg: lo instala el usuario y nosotros lo
buscamos en el `PATH`. Eso elimina toda la superficie de descarga (MITM, hashes,
extracción), pero abre otra: **secuestro del `PATH`**.

- ❌ `Command::new("ffmpeg")` dejando que el SO resuelva el nombre.
  En Windows, `CreateProcess` busca en el **directorio de la aplicación y en el
  directorio actual antes que en `PATH`**. Un `ffmpeg.exe` dejado en cualquiera
  de esos dos lugares se ejecuta antes que el real.
- ✅ Recorrer las entradas de `PATH` nosotros, quedarnos con la primera que sea
  un **archivo regular** (no un directorio homónimo) y spawnear la **ruta
  absoluta**.
- ✅ Validar con `ffmpeg -version` y confirmar que la salida empieza con
  `ffmpeg version`. Que exista un archivo llamado `ffmpeg` no prueba que lo sea.
- ❌ Que el usuario o la config puedan indicar una ruta arbitraria sin que eso se
  trate como frontera de confianza. Si algún día se agrega un "ffmpeg
  personalizado" en preferencias, ese campo es input hostil: validar que exista,
  que sea archivo, y pasar por el mismo `probe`.
- ✅ Si falta: **error explícito en la UI** con el comando de instalación. Un
  estado roto silencioso donde el botón de grabar no hace nada es peor que un
  mensaje de error.

Límite honesto de esta postura: si el atacante ya puede escribir en el `PATH` del
usuario, tiene ejecución de código por vías mucho más directas que la nuestra.
No pretendemos resolver eso — solo no ser el camino **más fácil**.

Señal de alarma en review: cualquier `Command::new` cuyo primer argumento sea un
nombre suelto en vez de una ruta absoluta resuelta y validada.

## 1b. ffmpeg — inyección de argumentos al ejecutarlo

**El riesgo más concreto del proyecto.** Un nombre de archivo o un preset que
viene del usuario y termina interpolado en una línea de comando es ejecución
arbitraria.

- ❌ `Command::new("sh").arg("-c").arg(format!("ffmpeg -i {input} ..."))`
- ❌ Cualquier `format!` que arme un comando completo como string.
- ✅ `Command` de Rust con args pasados **como array**, un elemento por argumento.
  (No es un sidecar de Tauri: el binario se descarga en runtime, así que
  `Command::new_sidecar()` no aplica. Se spawnea por ruta absoluta.)
- ✅ Rutas canonicalizadas antes de pasarlas.
- ✅ Presets de encoding desde un `enum` cerrado en Rust, nunca un string libre
  que viene de TS.

Ojo con los argumentos de ffmpeg que leen o escriben fuera del archivo objetivo
(`-f concat`, protocolos como `file:`, `-i` apuntando a una URL). Si el usuario
controla el input, restringí el protocolo explícitamente.

## 2. Frontera IPC — todo `#[tauri::command]` es entrada no confiable

El WebView puede estar comprometido (XSS, dependencia envenenada). Tratá cada
comando como si el input viniera de internet.

- Validá tipo, rango y forma **en Rust**. La validación en TS es UX, no seguridad.
- Nada de `unwrap()` / `expect()` en un command: un panic cruza el proceso.
- Devolvé errores tipados (`thiserror`) que **no filtren rutas absolutas del
  sistema, nombres de usuario ni internals** en el mensaje.
- Exponé el mínimo: si un command no lo llama nadie desde la UI, borralo del
  `invoke_handler`.

## 3. Path traversal al guardar

El usuario elige dónde guardar; el atacante también quiere elegir.

- Canonicalizá (`std::fs::canonicalize`) y **verificá que el resultado esté dentro
  del directorio permitido**. Chequear `..` en el string no alcanza: symlinks,
  UNC paths de Windows (`\\?\`, `\\server\share`) y encodings alternativos lo evaden.
- Sanitizá el nombre de archivo: sin separadores, sin nombres reservados de
  Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1`…`LPT9`).
- Preferí el diálogo nativo (`dialog` plugin) sobre una ruta escrita a mano.

## 4. Capabilities y permisos — mínimo privilegio

En Tauri v2 nada está permitido por defecto. Esa es la parte buena. La mala es
que es facilísimo abrir de más para "que ande".

Revisá `src-tauri/capabilities/*.json`:

- ¿Hay algún `:allow-*` con scope amplio que se puede acotar? `fs:allow-write-file`
  sin scope es escritura en todo el disco.
- ¿Alguna capability aplica a ventanas que no la necesitan? Acotá con `"windows"`.
- ¿Quedó algún permiso de cuando estabas debuggeando? Sacalo.
- `shell:allow-execute` abierto es game over. Solo sidecar con scope explícito.

## 5. Updater — la firma no es opcional

- `pubkey` presente en `tauri.conf.json` y correspondiente a la clave privada real.
- Endpoint **HTTPS**. Siempre.
- La clave privada **nunca** en el repo, ni en el historial. Vive en el keychain
  local y en GitHub Secrets.
- Nunca deshabilites la verificación de firma "temporalmente para probar". Un
  updater sin firma es un canal de distribución de malware con tu nombre.

## 6. Superficie del WebView

- CSP definida en `tauri.conf.json` → `app.security.csp`.
- Sin `unsafe-inline` ni `unsafe-eval`.
- Sin cargar contenido remoto dentro del WebView de la app.
- `devtools` deshabilitado en builds de release.
- Enlaces externos → navegador del sistema, nunca dentro de la ventana.

## 7. Privacidad — específico de un grabador de pantalla

Esto no es paranoia, es el contrato con el usuario:

- **Indicador visible mientras graba.** Siempre. Sin excepciones. Una app que
  puede grabar sin señal visible es spyware, no importa la intención.
- Permisos de pantalla/micrófono/cámara: pedidos explícitamente, con contexto.
- Sin telemetría, sin analytics, sin "crash reports anónimos" que incluyan rutas
  de archivos o nombres de ventana.
- Los archivos temporales de grabación se borran al terminar. No dejes frames
  crudos en `/tmp` esperando a que alguien pase.
- La única conexión saliente permitida es el check del updater.

## Formato del reporte

Por hallazgo: `archivo:línea` · qué está mal · **cómo se explota** · el fix.

| Severidad | Criterio |
|---|---|
| 🔴 Crítico | Ejecución de código, escape del sandbox, updater comprometido, grabación silenciosa |
| 🟠 Alto | Escritura/lectura fuera de scope, permiso demasiado amplio, filtrado de secretos |
| 🟡 Medio | Endurecimiento faltante, mensaje de error que filtra internals |
| 🔵 Bajo | Defensa en profundidad |

Si no hay hallazgos, decilo en una línea. Inventar hallazgos para justificar la
auditoría entrena al equipo a ignorar el reporte.
