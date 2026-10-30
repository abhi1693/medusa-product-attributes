import assert from "node:assert/strict"
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
