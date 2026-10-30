import { describe, expect, it, vi } from "vitest"
import { harness, template, timestamp } from "../helpers/backend"

const runtime = vi.hoisted(() => ({
  run: vi.fn().mockResolvedValue({}),
  steps: new Map<string, unknown>(),
  builder: undefined as unknown,
}))
vi.mock("@medusajs/medusa/core-flows", () => ({
  updateProductsWorkflow: {
    runAsStep: vi.fn(() => ({ config: () => "product_write" })),
  },
  updateProductVariantsWorkflow: {
    runAsStep: vi.fn(() => ({ config: () => "variant_write" })),
  },
}))
vi.mock("@medusajs/framework/workflows-sdk", async (original) => {
  const sdk =
    await original<typeof import("@medusajs/framework/workflows-sdk")>()
  return {
    ...sdk,
    createStep: (name: string, handler: unknown) => {
      runtime.steps.set(name, handler)
      return (input: unknown) => input
    },
    createWorkflow: (_name: string, builder: unknown) => {
      runtime.builder = builder
      return () => ({ run: runtime.run })
    },
    transform: (input: unknown, fn: (value: unknown) => unknown) => fn(input),
  }
})
import {
  mutateProductAttributes,
  prepareAttributesMutation,
  reserveAttributesBinding,
  restoreAttributesBinding,
  productMutationInput,
  variantMutationInput,
} from "../../src/workflows/write"

const version = `${timestamp}:1`
describe("canonical metadata write planning", () => {
  it("assigns a template to a draft and preserves unrelated native metadata", async () => {
    const h = harness(false)
    const result = await prepareAttributesMutation(
      {
        product_id: h.product.id,
        assignment: {
          version: `${timestamp}:0`,
          template_id: template.id,
          template_version: 1,
        },
      },
      h
    )
    expect(result.output).toMatchObject({
      product_id: h.product.id,
      template_id: template.id,
      template_version: 1,
      binding_version: 0,
      products: [
        {
          id: h.product.id,
          metadata: { product_attributes: { version: 1, values: {} } },
        },
      ],
      variants: [],
    })
    expect(h.product.metadata).toEqual({ other: "preserved" })
    expect(productMutationInput({ plan: result.output })).toEqual({
      products: result.output.products,
    })
    expect(variantMutationInput({ plan: result.output })).toEqual({
      product_variants: [],
    })
    const builder = runtime.builder as (value: unknown) => unknown
    expect(builder(result.output)).toBeDefined()
  })
  it("merges only selected scopes, supports explicit clearing and retains schema pin", async () => {
    const h = harness()
    const next = await prepareAttributesMutation(
      {
        product_id: h.product.id,
        values: {
          version,
          values: { model: null },
          variants: [{ id: "variant_test", version, values: { ports: 0 } }],
        },
      },
      h
    )
    expect(next.output.products[0].metadata.product_attributes).toMatchObject({
      template_id: template.id,
      template_version: 1,
      version: 2,
      values: {},
    })
    expect(next.output.variants).toEqual([
      {
        id: "variant_test",
        metadata: { product_attributes: { version: 2, values: { ports: 0 } } },
      },
    ])
    const variantOnly = await prepareAttributesMutation(
      {
        product_id: h.product.id,
        values: {
          version,
          variants: [{ id: "variant_test", version, values: { ports: 9 } }],
        },
      },
      h
    )
    expect(
      variantOnly.output.products[0].metadata.product_attributes.values
    ).toEqual({ model: "Example" })
    h.product.variants[0].metadata = {}
    const fresh = await prepareAttributesMutation(
      {
        product_id: h.product.id,
        values: {
          version,
          variants: [
            {
              id: "variant_test",
              version: `${timestamp}:0`,
              values: { ports: 1 },
            },
          ],
        },
      },
      h
    )
    expect(fresh.output.variants[0].metadata.product_attributes).toMatchObject({
      version: 1,
    })
    h.product.variants = undefined
    expect(
      (
        await prepareAttributesMutation(
          { product_id: h.product.id, values: { version } },
          h
        )
      ).output.variants
    ).toEqual([])
  })
  it("rejects stale product/variant versions, duplicates and cross-product IDs", async () => {
    const h = harness()
    await expect(
      prepareAttributesMutation(
        { product_id: h.product.id, values: { version: "stale" } },
        h
      )
    ).rejects.toThrow("record changed")
    await expect(
      prepareAttributesMutation(
        {
          product_id: h.product.id,
          values: {
            version,
            variants: [{ id: "variant_test", version: "stale", values: {} }],
          },
        },
        h
      )
    ).rejects.toThrow("record changed")
    await expect(
      prepareAttributesMutation(
        {
          product_id: h.product.id,
          values: { version, variants: [{ id: "other", version, values: {} }] },
        },
        h
      )
    ).rejects.toThrow("does not belong")
    const entry = { id: "variant_test", version, values: {} }
    await expect(
      prepareAttributesMutation(
        {
          product_id: h.product.id,
          values: { version, variants: [entry, entry] },
        },
        h
      )
    ).rejects.toThrow("unique")
  })
  it("refuses missing/archived assignment, invalid values and incompatible adoption", async () => {
    const h = harness(false)
    await expect(
      prepareAttributesMutation(
        { product_id: h.product.id, values: { version: `${timestamp}:0` } },
        h
      )
    ).rejects.toThrow("Assign a template")
    h.service.revision.mockResolvedValue({ ...template, archived: true })
    await expect(
      prepareAttributesMutation(
        {
          product_id: h.product.id,
          assignment: {
            version: `${timestamp}:0`,
            template_id: template.id,
            template_version: 1,
          },
        },
        h
      )
    ).rejects.toThrow("Archived")
    const assigned = harness()
    await expect(
      prepareAttributesMutation(
        {
          product_id: assigned.product.id,
          values: { version, values: { model: 42 } },
        },
        assigned
      )
    ).rejects.toThrow("Enter text")
    assigned.product.status = "published"
    await expect(
      prepareAttributesMutation(
        {
          product_id: assigned.product.id,
          values: { version, values: { model: " " } },
        },
        assigned
      )
    ).rejects.toThrow("required")
    assigned.service.revision.mockResolvedValue({
      ...template,
      version: 2,
      fields: template.fields.map((field) =>
        field.key === "ports" ? { ...field, min: 16 } : field
      ),
    })
    await expect(
      prepareAttributesMutation(
        {
          product_id: assigned.product.id,
          assignment: {
            version,
            template_id: template.id,
            template_version: 2,
          },
        },
        assigned
      )
    ).rejects.toThrow("outside the allowed range")
  })
  it("reserves a versioned binding, compensates it and serializes canonical writes", async () => {
    const h = harness()
    const input = {
      product_id: h.product.id,
      template_id: template.id,
      template_version: 1,
      binding_version: 1,
    }
    const reserved = await reserveAttributesBinding(input, h)
    expect(reserved.output).toBe(h.product.id)
    expect(h.service.reserveBinding).toHaveBeenCalledWith(
      h.product.id,
      template.id,
      1,
      1
    )
    await restoreAttributesBinding(reserved.compensateInput, h)
    expect(h.service.restoreBinding).toHaveBeenCalledWith(
      reserved.compensateInput
    )
    await restoreAttributesBinding(undefined, h)
    expect(h.service.restoreBinding).toHaveBeenCalledTimes(1)
    const mutation = { product_id: h.product.id, values: { version } }
    expect(
      (await mutateProductAttributes(h.container, mutation)).can_write
    ).toBe(true)
    expect(h.locking.execute).toHaveBeenCalledWith(
      `product-attributes:${h.product.id}`,
      expect.any(Function),
      { timeout: 10 }
    )
    expect(runtime.run).toHaveBeenCalledWith({ input: mutation })
    expect(
      (await mutateProductAttributes(h.container, mutation, false)).can_write
    ).toBe(false)
  })
})
