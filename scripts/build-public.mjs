import { build } from "esbuild"
import { readFile } from "node:fs/promises"

const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
)
await build({
  entryPoints: { client: "src/client.ts" },
  outdir: ".medusa/server/public",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: Object.keys(pkg.peerDependencies),
  outExtension: { ".js": ".mjs" },
})
await import("./check-package.mjs")
