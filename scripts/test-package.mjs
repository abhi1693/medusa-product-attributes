import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"

const execute = promisify(execFile)

async function fixture(run) {
  const root = await mkdtemp(
    path.join(tmpdir(), "attributes-package-contract-")
  )
  const write = async (name, content) => {
    const target = path.join(root, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  try {
    await write("scripts/.keep", "")
    await copyFile(
      new URL("./check-package.mjs", import.meta.url),
      path.join(root, "scripts/check-package.mjs")
    )
    await write(
      "package.json",
      JSON.stringify({
        exports: {
          "./client": {
            types: "./.medusa/server/src/client.d.ts",
            import: "./.medusa/server/public/client.mjs",
            require: "./.medusa/server/src/client.js",
          },
          "./admin": {
            import: "./.medusa/server/src/admin/index.mjs",
            require: "./.medusa/server/src/admin/index.js",
          },
          "./.medusa/server/src/modules/*":
            "./.medusa/server/src/modules/*/index.js",
        },
      })
    )
    await write("src/client.ts", "export const client = true\n")
    await write(
      ".medusa/server/src/client.d.ts",
      "export declare const client: boolean\n"
    )
    await write(".medusa/server/src/client.js", "exports.client = true\n")
    await write(
      ".medusa/server/public/client.mjs",
      "export const client = true\n"
    )
    await write(
      ".medusa/server/src/admin/index.mjs",
      "export const widgets = []\n"
    )
    await write(".medusa/server/src/admin/index.js", "exports.widgets = []\n")
    const check = () =>
      execute(process.execPath, ["scripts/check-package.mjs"], { cwd: root })
    await run({ write, check, root })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test("declared package targets include a real browser ESM entry and native Admin outputs", async () => {
  await fixture(async ({ check }) => {
    const result = await check()
    assert.equal(result.stderr, "")
  })
})

test("an incorrectly emitted or missing browser export fails before packing", async () => {
  await fixture(async ({ check, root }) => {
    await rm(path.join(root, ".medusa/server/public/client.mjs"))
    await assert.rejects(check, (error) => {
      assert.equal(error.code, 1)
      assert.match(error.stderr, /ENOENT.*public\/client\.mjs/s)
      return true
    })
  })
})

test("an empty browser bundle cannot satisfy the public client export", async () => {
  await fixture(async ({ check, write }) => {
    await write(".medusa/server/public/client.mjs", "export {}\n")
    await assert.rejects(check, (error) => {
      assert.match(error.stderr, /browser client entry has no ESM exports/)
      return true
    })
  })
})

test("a reused build volume cannot ship orphaned compiled code from another plugin", async () => {
  await fixture(async ({ check, write }) => {
    await write(
      ".medusa/server/src/modules/access-control/service.js",
      "exports.unrelated = true\n"
    )
    await assert.rejects(check, (error) => {
      assert.match(
        error.stderr,
        /Orphaned compiled source: modules\/access-control\/service\.js/
      )
      return true
    })
  })
})
