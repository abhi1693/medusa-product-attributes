import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { createWriteStream } from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"

if (process.env.CI !== "true") throw new Error("Browser tests require CI mode")
const connection = new URL(
  process.env.PRODUCT_ATTRIBUTES_TEST_DATABASE_URL || ""
)
if (
  !["postgres:", "postgresql:"].includes(connection.protocol) ||
  !["127.0.0.1", "localhost"].includes(connection.hostname)
) {
  throw new Error("Browser tests require an isolated local PostgreSQL service")
}
connection.pathname = "/postgres"
const require = createRequire(import.meta.url)
const { ModulesSdkUtils } = require("@medusajs/framework/utils")
const database = ModulesSdkUtils.createPgConnection({
  clientUrl: connection.href,
  pool: { min: 0, max: 2 },
})
const root = process.cwd()
const host = path.join(root, "tests/host")
const databaseName = `attributes_browser_${randomBytes(8).toString("hex")}_test`
const target = new URL(connection)
target.pathname = `/${databaseName}`
const output = path.join(root, "artifacts")
await mkdir(output, { recursive: true })
const log = createWriteStream(path.join(output, "browser-server.log"))
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: target.href,
  JWT_SECRET: randomBytes(32).toString("hex"),
  COOKIE_SECRET: randomBytes(32).toString("hex"),
  ATTRIBUTES_FIXTURE_PATH: path.join(output, "fixtures.json"),
  ATTRIBUTES_TEST_URL: "http://127.0.0.1:9000",
  MEDUSA_DISABLE_TELEMETRY: "true",
  BROWSER: "none",
}
const cli = path.join(host, "node_modules/@medusajs/cli/cli.js")
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: host,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    child.stdout.pipe(log, { end: false })
    child.stderr.pipe(log, { end: false })
    child.once("error", reject)
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Medusa ${args[0]} exited ${code}`))
    )
  })
let server
let created = false
try {
  await database.raw("create database ??", [databaseName])
  created = true
  await run(["db:migrate"])
  await run(["exec", "./src/scripts/seed.ts"])
  server = spawn(process.execPath, [cli, "develop", "--host", "127.0.0.1"], {
    cwd: host,
    env: { ...env, NODE_ENV: "development" },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  server.stdout.pipe(log, { end: false })
  server.stderr.pipe(log, { end: false })
  let ready = false
  for (let attempt = 0; attempt < 180; attempt++) {
    if (server.exitCode !== null)
      throw new Error("Browser host exited at startup")
    try {
      const response = await fetch(`${env.ATTRIBUTES_TEST_URL}/app`, {
        signal: AbortSignal.timeout(2000),
      })
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error("Browser host did not become ready")
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "node_modules/@playwright/test/cli.js"), "test"],
      { cwd: root, env, stdio: "inherit" }
    )
    child.once("error", reject)
    child.once("exit", resolve)
  })
  if (result !== 0) throw new Error(`Playwright exited ${result}`)
} catch (error) {
  log.end()
  const lines = (
    await readFile(path.join(output, "browser-server.log"), "utf8")
  )
    .split("\n")
    .slice(-60)
    .join("\n")
  console.error(lines)
  throw error
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM")
    } catch {}
    await new Promise((resolve) => {
      if (server.exitCode !== null) resolve()
      else {
        server.once("exit", resolve)
        setTimeout(() => {
          try {
            process.kill(-server.pid, "SIGKILL")
          } catch {}
          resolve()
        }, 5000).unref()
      }
    })
  }
  if (created)
    await database.raw("drop database ?? with (force)", [databaseName])
  await database.destroy()
  log.end()
}
