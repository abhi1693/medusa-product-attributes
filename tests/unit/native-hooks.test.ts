import { describe, expect, it, vi } from "vitest"
import { harness } from "../helpers/backend"
const hooks = vi.hoisted(() => ({
  created: vi.fn(),
  updated: vi.fn(),
  variantsCreated: vi.fn(),
  variantsUpdated: vi.fn(),
}))
vi.mock("@medusajs/medusa/core-flows", () => ({
  createProductsWorkflow: { hooks: { productsCreated: hooks.created } },
  updateProductsWorkflow: { hooks: { productsUpdated: hooks.updated } },
  createProductVariantsWorkflow: {
    hooks: { productVariantsCreated: hooks.variantsCreated },
  },
  updateProductVariantsWorkflow: {
    hooks: { productVariantsUpdated: hooks.variantsUpdated },
  },
}))
import {
  registerNativeValidation,
  validateNativeProducts,
  validateNativeVariants,
} from "../../src/workflows/native-validation"
import loadNativeValidation from "../../src/modules/product-attributes/loaders/native-validation"
import synchronize from "../../src/scripts/sync-templates"
import moduleDefinition from "../../src/modules/product-attributes"
import { PRODUCT_ATTRIBUTES } from "../../src/index"

describe("native lifecycle extension", () => {
  it("supports explicit hook composition, registers four public hooks once and respects loader opt-out", async () => {
    expect(moduleDefinition).toBeDefined()
    expect(PRODUCT_ATTRIBUTES).toBe("product_attributes")
    await loadNativeValidation({
      options: { register_native_hooks: false },
    } as never)
    expect(hooks.created).not.toHaveBeenCalled()
    await loadNativeValidation({ options: undefined } as never)
    registerNativeValidation()
    for (const hook of Object.values(hooks))
      expect(hook).toHaveBeenCalledTimes(1)
    expect(hooks.created).toHaveBeenCalledWith(validateNativeProducts)
    expect(hooks.variantsUpdated).toHaveBeenCalledWith(validateNativeVariants)
  })
  it("validates parent products once and lets native workflow compensation handle a rejection", async () => {
    const h = harness()
    await validateNativeProducts(
      { products: [{ id: h.product.id }, { id: h.product.id }] },
      h
    )
    expect(h.products.retrieveProduct).toHaveBeenCalledTimes(1)
    await validateNativeVariants(
      { product_variants: [{ id: "var1" }, { id: "var2" }] },
      h
    )
    expect(h.products.retrieveProduct).toHaveBeenCalledTimes(2)
    h.products.retrieveProductVariant.mockResolvedValue({
      product_id: undefined,
    })
    await validateNativeVariants({ product_variants: [{ id: "orphan" }] }, h)
    expect(h.products.retrieveProduct).toHaveBeenCalledTimes(2)
    h.product.status = "published"
    h.specification!.values = {}
    await expect(
      validateNativeProducts({ products: [{ id: h.product.id }] }, h)
    ).rejects.toThrow("required")
  })
  it("synchronizes only explicitly invoked configured template definitions", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const service = { synchronize: vi.fn().mockResolvedValue({ changed: 2 }) }
    const container = { resolve: () => service }
    await synchronize({ container } as never)
    expect(service.synchronize).toHaveBeenCalledOnce()
    expect(info).toHaveBeenCalledWith(
      "Synchronized product specification templates: 2 changes"
    )
  })
})
