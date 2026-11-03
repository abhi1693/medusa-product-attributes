import { build } from "esbuild"
import { copyFile, readFile } from "node:fs/promises"

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
await copyFile(
  new URL(
    "../src/modules/product-attributes/migrations/.snapshot-product-attributes.json",
    import.meta.url
  ),
  new URL(
    "../.medusa/server/src/modules/product-attributes/migrations/.snapshot-product-attributes.json",
    import.meta.url
  )
)
await import("./check-package.mjs")
