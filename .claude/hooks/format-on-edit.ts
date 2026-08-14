/**
 * PostToolUse hook: formatea el archivo recién editado.
 *
 * .ts/.tsx/.js/.jsx/.json/.css -> biome
 * .rs                          -> rustfmt
 *
 * Si la herramienta no está instalada, sale en silencio con 0.
 * Un hook nunca debe romper la sesión por una dependencia ausente.
 */

const BIOME_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$/;

const payload = await Bun.stdin.json().catch(() => null);
const file = payload?.tool_input?.file_path;

if (typeof file !== "string" || file.length === 0) process.exit(0);

const cmd = file.endsWith(".rs")
  ? ["rustfmt", "--edition", "2021", file]
  : BIOME_EXT.test(file)
    ? ["bunx", "biome", "check", "--write", "--no-errors-on-unmatched", file]
    : null;

if (!cmd) process.exit(0);

// ponytail: exit 0 pase lo que pase. El formateo es cosmético, no un gate.
// El gate real es `bun run lint` antes del commit.
await Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" })
  .exited.catch(() => 0);

process.exit(0);
