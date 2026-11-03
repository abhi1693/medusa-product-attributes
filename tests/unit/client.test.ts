import { expect, test, vi } from "vitest"
import {
  createProductAttributesClient,
  type AttributesTransport,
} from "../../src/client"
import type { StoreProductAttributes } from "../../src/types"

test("public client preserves supplied transport and encodes entity identifiers", async () => {
  const fetch = vi.fn(async () => ({ result: true }))
  const client = createProductAttributesClient({
    fetch: fetch as AttributesTransport["fetch"],
  })
  const template = { key: "switch", name: "Switch", fields: [] }
  const assignment = {
    version: "stamp",
    groups: [{ template_id: "template", template_version: 2 }],
  }
  const values = {
    version: "stamp",
    values: { poe: false, ports: 0, unset: null },
  }
  await client.templates()
  await client.templates({
    q: "switch",
    offset: 20,
    limit: 20,
    include_archived: true,
  })
  await client.template("template/type")
  await client.templateProducts("template/type")
  await client.templateProducts("template/type", {
    offset: 20,
    limit: 20,
    outdated: true,
  })
  await client.createTemplate(template)
  await client.reviseTemplate("template/type", { ...template, version: 1 })
  await client.archiveTemplate("template/type", 2)
  await client.deleteTemplate("template/type", 2)
  await client.product("product/type")
  await client.storeProduct("product/type")
  await client.assignGroups("product/type", assignment)
  await client.saveValues("product/type", values)
  await client.exportMetadata("product/type", "specification_revision_2")
  await client.validate("product/type")
  expect(fetch.mock.calls).toEqual([
    ["/admin/product-attributes/templates", { query: {} }],
    [
      "/admin/product-attributes/templates",
      { query: { q: "switch", offset: 20, limit: 20, include_archived: true } },
    ],
    ["/admin/product-attributes/templates/template%2Ftype"],
    [
      "/admin/product-attributes/templates/template%2Ftype/products",
      { query: {} },
    ],
    [
      "/admin/product-attributes/templates/template%2Ftype/products",
      { query: { offset: 20, limit: 20, outdated: true } },
    ],
    ["/admin/product-attributes/templates", { method: "POST", body: template }],
    [
      "/admin/product-attributes/templates/template%2Ftype",
      { method: "POST", body: { ...template, version: 1 } },
    ],
    [
      "/admin/product-attributes/templates/template%2Ftype/archive",
      { method: "POST", body: { version: 2 } },
    ],
    [
      "/admin/product-attributes/templates/template%2Ftype",
      { method: "DELETE", body: { version: 2 } },
    ],
    ["/admin/product-attributes/products/product%2Ftype"],
    ["/store/products/product%2Ftype/attributes"],
    [
      "/admin/product-attributes/products/product%2Ftype/groups",
      { method: "POST", body: assignment },
    ],
    [
      "/admin/product-attributes/products/product%2Ftype/values",
      { method: "POST", body: values },
    ],
    [
      "/admin/product-attributes/products/product%2Ftype/export",
      { method: "POST", body: { version: "specification_revision_2" } },
    ],
    [
      "/admin/product-attributes/products/product%2Ftype/validate",
      { method: "POST" },
    ],
  ])
})

test("the Store reader preserves the public typed response without wrapping it", async () => {
  const response: StoreProductAttributes = {
    product_id: "product",
    groups: [
      {
        key: "network_device",
        name: "Network device",
        version: 2,
        fields: [
          {
            key: "ports",
            label: "Ports",
            scope: "product",
            type: "number",
            required: true,
            unit: "ports",
            min: 0,
            max: 48,
            searchable: true,
            filterable: true,
            comparable: true,
          },
        ],
      },
    ],
    values: { ports: 0, poe: false },
    variants: [{ id: "variant", values: { colour: "White" } }],
  }
  const fetch = vi.fn(async () => response)
  const client = createProductAttributesClient({
    fetch: fetch as AttributesTransport["fetch"],
  })
  const result: StoreProductAttributes = await client.storeProduct("product")
  expect(result).toBe(response)
  expect(fetch).toHaveBeenCalledWith("/store/products/product/attributes")
  const unavailable = new Error("Product attributes not found")
  fetch.mockRejectedValueOnce(unavailable)
  await expect(client.storeProduct("unpublished")).rejects.toBe(unavailable)
})
