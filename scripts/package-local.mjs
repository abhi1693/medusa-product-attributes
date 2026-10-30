import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

await import("./check-package.mjs")
const output = path.resolve("artifacts")
await mkdir(output, { recursive: true })
const [packed] = JSON.parse(
  execFileSync(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", output],
    { encoding: "utf8" }
  )
)
assert.equal(packed.name, "@abhi1693/medusa-product-attributes")
const sha256 = createHash("sha256")
  .update(await readFile(path.join(output, packed.filename)))
  .digest("hex")
await writeFile(
  path.join(output, "SHA256SUMS"),
  `${sha256}  ${packed.filename}\n`
)
console.info(
  JSON.stringify({
    archive: path.join(output, packed.filename),
    sha256,
    release: false,
  })
)
