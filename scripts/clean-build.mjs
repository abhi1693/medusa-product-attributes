import { rm } from "node:fs/promises"

await rm(new URL("../.medusa/server/", import.meta.url), {
  recursive: true,
  force: true,
})
