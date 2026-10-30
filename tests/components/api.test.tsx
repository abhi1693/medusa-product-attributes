import { afterEach, expect, test, vi } from "vitest"

const constructor = vi.hoisted(() => vi.fn())
vi.mock("@medusajs/js-sdk", () => ({
  default: class {
    client = { fetch: vi.fn() }
    constructor(options: unknown) {
      constructor(options)
    }
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

test("Admin SDK defaults to session authentication and current backend origin", async () => {
  const { attributesKeys } = await import("../../src/admin/lib/api.js")
  expect(constructor).toHaveBeenLastCalledWith({
    baseUrl: window.location.origin,
    auth: { type: "session", jwtTokenStorageKey: undefined },
  })
  expect(attributesKeys.templates).toEqual(["product-attributes", "templates"])
  expect(attributesKeys.template("template")).toEqual([
    "product-attributes",
    "templates",
    "template",
  ])
  expect(attributesKeys.product("product")).toEqual([
    "product-attributes",
    "products",
    "product",
  ])
})

test("Admin SDK follows configured backend, bearer mode and token storage", async () => {
  vi.stubGlobal("__BACKEND_URL__", "https://commerce.example.com")
  vi.stubGlobal("__AUTH_TYPE__", "jwt")
  vi.stubGlobal("__JWT_TOKEN_STORAGE_KEY__", "store-admin")
  await import("../../src/admin/lib/api.js")
  expect(constructor).toHaveBeenLastCalledWith({
    baseUrl: "https://commerce.example.com",
    auth: { type: "jwt", jwtTokenStorageKey: "store-admin" },
  })
})
