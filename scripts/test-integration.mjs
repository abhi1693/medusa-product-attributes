import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { copyFile, mkdir, readFile, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"

assert.equal(
  process.env.CI,
  "true",
  "Integration tests run in explicit CI mode only"
)
const source = new URL(
  process.env.ATTRIBUTES_TEST_DATABASE_URL ||
    process.env.PRODUCT_ATTRIBUTES_TEST_DATABASE_URL ||
    ""
)
assert.ok(
  ["postgres:", "postgresql:"].includes(source.protocol) &&
    ["127.0.0.1", "localhost"].includes(source.hostname) &&
    source.pathname === "/postgres",
  "Integration tests require the isolated local PostgreSQL service"
)
const root = process.cwd()
const host = path.join(root, "tests/host")
const require = createRequire(import.meta.url)
const { ModulesSdkUtils } = require("@medusajs/framework/utils")
const db = ModulesSdkUtils.createPgConnection({
  clientUrl: source.href,
  pool: { min: 0, max: 2 },
})
const name = `attributes_plugin_${randomBytes(8).toString("hex")}_test`
const target = new URL(source)
target.pathname = `/${name}`
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: target.href,
  JWT_SECRET: randomBytes(32).toString("hex"),
  COOKIE_SECRET: randomBytes(32).toString("hex"),
  MEDUSA_DISABLE_TELEMETRY: "true",
}
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn("npm", args, { cwd: host, env, stdio: "inherit" })
    child.once("error", reject)
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`npm exited ${code}`))
    )
  })
const script = path.join(host, "src/scripts/integration-check.ts")
let created = false
try {
  const installed = JSON.parse(
    await readFile(
      path.join(
        host,
        "node_modules/@abhi1693/medusa-product-attributes/package.json"
      ),
      "utf8"
    )
  )
  assert.equal(installed.name, "@abhi1693/medusa-product-attributes")
  assert.equal(installed.version, "0.0.1")
  await mkdir(path.dirname(script), { recursive: true })
  await copyFile(path.join(root, "tests/integration/attributes.ts"), script)
  await db.raw("create database ??", [name])
  created = true
  await run(["run", "db:migrate"])
  await run(["run", "build"])
  await run([
    "exec",
    "--",
    "medusa",
    "exec",
    "./src/scripts/integration-check.ts",
  ])
} finally {
  if (created) await db.raw("drop database ?? with (force)", [name])
  await db.destroy()
  await rm(script, { force: true })
}
