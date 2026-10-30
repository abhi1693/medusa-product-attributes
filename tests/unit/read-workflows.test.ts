import { describe, expect, it, vi } from "vitest"
import {
  envelope,
  variantEnvelope,
  productState,
  productIssues,
  validateProduct,
  enforceProduct,
  productView,
  versionOf,
} from "../../src/workflows/read"
import { harness, template, timestamp } from "../helpers/backend"

describe("owning-module reads and assignment integrity", () => {
  it("rejects malformed namespace envelopes and binding mismatches", async () => {
    expect(() =>
      envelope({ product_attributes: null }, "product_attributes")
    ).toThrow("Invalid product")
    expect(() =>
      variantEnvelope({ product_attributes: null }, "product_attributes")
    ).toThrow("Invalid variant")
    for (const mismatch of [
      null,
      { template_id: "other", template_version: 1, version: 1 },
      { template_id: template.id, template_version: 2, version: 1 },
      { template_id: template.id, template_version: 1, version: 2 },
    ]) {
      const h = harness()
      h.service.binding.mockResolvedValue(mismatch)
      await expect(productState(h.container, h.product.id)).rejects.toThrow(
        "does not match"
      )
    }
    const h = harness(false)
    h.service.binding.mockResolvedValue({
      template_id: template.id,
      template_version: 1,
      version: 1,
    })
    await expect(productState(h.container, h.product.id)).rejects.toThrow(
      "does not match"
    )
    const valid = harness()
    expect(
      (await productState(valid.container, valid.product.id)).template
    ).toEqual(template)
    expect(valid.products.retrieveProduct).toHaveBeenCalledWith(
      valid.product.id,
      { relations: ["variants"] }
    )
  })
  it("supports generic unassigned products and refuses variant metadata before assignment", async () => {
    const h = harness(false)
    expect(await validateProduct(h.container, h.product.id)).toEqual([])
    h.product.variants = undefined
    expect(await validateProduct(h.container, h.product.id)).toEqual([])
    h.product.variants = [
      {
        id: "var",
        metadata: { product_attributes: { version: 1, values: {} } },
      },
    ]
    await expect(validateProduct(h.container, h.product.id)).rejects.toThrow(
      "Assign a product template"
    )
  })
  it("accepts partial drafts and enforces required Product/Variant values on publication", async () => {
    const h = harness()
    h.product.metadata.product_attributes.values = {}
    h.product.variants[0].metadata.product_attributes.values = {}
    expect(await validateProduct(h.container, h.product.id)).toEqual([])
    expect(await validateProduct(h.container, h.product.id, true)).toHaveLength(
      2
    )
    h.product.status = "published"
    await expect(enforceProduct(h.container, h.product.id)).rejects.toThrow(
      "values.model: Model is required"
    )
    await expect(
      enforceProduct(h.container, h.product.id, false)
    ).resolves.toBeUndefined()
    expect(productIssues(template, {}, "product_attributes", false)).toEqual([])
  })
  it("reports stable scoped paths and complete Admin validation while drafts remain editable", async () => {
    const h = harness()
    const result = await productView(h.container, h.product.id, false)
    expect(result).toMatchObject({
      product_id: h.product.id,
      template,
      assignment_version: 1,
      values: { model: "Example" },
      can_write: false,
      variants: [
        { id: "variant_test", values: { ports: 8 }, version: `${timestamp}:1` },
      ],
    })
    expect(result.version).toBe(`${timestamp}:1`)
    expect(versionOf(new Date(timestamp))).toBe(`${timestamp}:0`)
    h.product.variants[0].metadata = {}
    expect(
      (await productView(h.container, h.product.id, true)).validation[0].path
    ).toBe("variants.variant_test.values.ports")
    const unassigned = harness(false)
    expect(
      await productView(unassigned.container, unassigned.product.id, true)
    ).toMatchObject({
      template: null,
      assignment_version: 0,
      values: {},
      validation: [],
      variants: [{ values: {} }],
    })
    unassigned.product.variants = undefined
    expect(
      (await productView(unassigned.container, unassigned.product.id, true))
        .variants
    ).toEqual([])
  })
})
