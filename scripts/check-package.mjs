import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { access, readFile, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"

const root = new URL("../", import.meta.url)
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"))
const targets = (value) =>
  typeof value === "string" ? [value] : Object.values(value).flatMap(targets)
for (const target of targets(pkg.exports).filter(
  (target) => !target.includes("*")
))
  await access(new URL(target, root))
const client = await import(new URL(pkg.exports["./client"].import, root))
assert.ok(
  Object.keys(client).length,
  "The browser client entry has no ESM exports"
)
async function inspect(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative + entry.name
    if (entry.isDirectory())
      await inspect(new URL(entry.name + "/", directory), name + "/")
    else if (entry.name.endsWith(".js") && name !== "admin/index.js") {
      assert.ok(
        [".ts", ".tsx", ".js"].some((extension) =>
          existsSync(new URL("src/" + name.slice(0, -3) + extension, root))
        ),
        `Orphaned compiled source: ${name}`
      )
    }
  }
}
await inspect(new URL(".medusa/server/src/", root))

const snapshot =
  "src/modules/product-attributes/migrations/.snapshot-product-attributes.json"
assert.equal(
  await readFile(new URL(".medusa/server/" + snapshot, root), "utf8"),
  await readFile(new URL(snapshot, root), "utf8"),
  "Packaged migration snapshot differs from source"
)

const require = createRequire(import.meta.url)
const commonjsClient = require(
  new URL(pkg.exports["./client"].require, root).pathname
)
for (const name of Object.keys(client).filter((name) => name !== "default"))
  assert.equal(typeof commonjsClient[name], typeof client[name], name)
