import { describe, expect, it } from "vitest"
import {
  productState,
  productIssues,
  validateProduct,
  enforceProduct,
  productView,
  specificationVersion,
  specificationSnapshot,
} from "../../src/workflows/read"
import { harness, template } from "../helpers/backend"

describe("owning-module specification reads", () => {
  it("loads owning native identity and the current immutable owned revision", async () => {
    const h = harness()
    expect(
      (await productState(h.container, h.product.id)).specification
    ).toEqual(h.specification)
    expect(h.products.retrieveProduct).toHaveBeenCalledWith(h.product.id, {
      relations: ["variants", "categories"],
    })
    h.product.metadata = {
      product_attributes: { template_id: "forged", values: { model: 42 } },
    }
    expect((await productView(h.container, h.product.id, true)).values).toEqual(
      { model: "Example" }
    )
  })
  it("supports unassigned products independently of arbitrary native metadata", async () => {
    const h = harness(false)
    h.product.metadata = { product_attributes: null }
    expect(await validateProduct(h.container, h.product.id)).toEqual([])
    expect(specificationVersion(null)).toBe("unassigned")
    const view = await productView(h.container, h.product.id, false)
    expect(view).toMatchObject({
      template: null,
      assignment_version: 0,
      version: "unassigned",
      values: {},
      validation: [],
      can_write: false,
      variants: [{ values: {}, version: "unassigned" }],
    })
    h.product.variants = undefined
    expect(
      (await productView(h.container, h.product.id, true)).variants
    ).toEqual([])
  })
  it("allows partial drafts while native publication and complete reads require current live variants", async () => {
    const h = harness()
    h.specification!.values = {}
    h.specification!.variants = {}
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
    expect(
      productIssues(template, { values: {}, variants: [] }, false)
    ).toEqual([])
    expect(specificationSnapshot({}, h.specification!)).toEqual({
      values: {},
      variants: [],
    })
  })
  it("uses revision versions, ignores native timestamp churn, and suggests only explicit category matches", async () => {
    const h = harness()
    h.product.categories = [{ id: "cat_network" }]
    h.service.page.mockResolvedValue({
      templates: [
        { ...template, category_ids: ["cat_network"] },
        { ...template, id: "other", category_ids: [] },
        { ...template, id: "none", category_ids: undefined },
      ],
    })
    let view = await productView(h.container, h.product.id, true)
    expect(view.version).toBe("psrev_1")
    expect(view.variants[0]).toMatchObject({
      version: "psrev_1",
      values: { ports: 8 },
    })
    expect(view.templates.map((item) => item.recommended)).toEqual([
      true,
      false,
      false,
    ])
    h.product.updated_at = "2030-01-01T00:00:00Z"
    h.product.categories = undefined
    view = await productView(h.container, h.product.id, true)
    expect(view.version).toBe("psrev_1")
    expect(view.templates.every((item) => !item.recommended)).toBe(true)
    h.product.variants.push({ id: "new", title: "New" })
    expect(
      (await productView(h.container, h.product.id, true)).validation[0].path
    ).toBe("variants.new.values.ports")
  })
})
