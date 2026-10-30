import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdir, readFile, readdir, rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const host = new URL("../tests/host/", import.meta.url)
const pkg = JSON.parse(await readFile(new URL("package.json", host), "utf8"))
assert.equal(
  pkg.name,
  "product-attributes-example",
  "Expected the isolated compatibility host"
)

// npm can reconstruct an old local-tar integrity from node_modules' hidden lock
// even after package-lock.json is removed. Generate the consumer lock from the
// current archive with no installed dependency state, then verify normal npm ci.
const dependencies = new URL("node_modules/", host)
await mkdir(dependencies, { recursive: true })
for (const entry of await readdir(dependencies)) {
  await rm(new URL(entry, dependencies), { recursive: true, force: true })
}
await rm(new URL("package-lock.json", host), { force: true })
for (const args of [
  [
    "install",
    "--package-lock-only",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  ["ci", "--no-audit", "--no-fund"],
]) {
  const result = spawnSync("npm", args, {
    cwd: fileURLToPath(host),
    stdio: "inherit",
  })
  if (result.error) throw result.error
  assert.equal(
    result.status,
    0,
    `npm ${args[0]} failed in the compatibility host`
  )
}
