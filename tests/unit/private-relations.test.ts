import { describe, expect, it, vi } from "vitest"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { validateAndTransformQuery } from "@medusajs/framework/http"
import {
  AdminGetProductParams,
  AdminGetProductVariantParams,
} from "@medusajs/medusa/api/admin/products/validators"
import {
  retrieveProductQueryConfig,
  retrieveVariantConfig,
} from "@medusajs/medusa/api/admin/products/query-config"
import { AdminGetProductVariantsParams } from "@medusajs/medusa/api/admin/product-variants/validators"
import { listProductVariantQueryConfig } from "@medusajs/medusa/api/admin/product-variants/query-config"
import { StoreGetProductsParams } from "@medusajs/medusa/api/store/products/validators"
import { retrieveProductQueryConfig as storeProductQueryConfig } from "@medusajs/medusa/api/store/products/query-config"
import { protectPrivateSpecificationRelations } from "../../src/api/private-relations"

function request(fields: string, disallowed?: Array<string | RegExp>) {
  return {
    query: { fields },
    allowed: [],
    disallowed,
  } as unknown as MedusaRequest
}
const response = {} as MedusaResponse

describe("private specification HTTP relations", () => {
  it("adds only the owned segments while preserving host restrictions and array ownership", () => {
    const host = ["secret", /^internal_/, "product_specification"]
    const req = request("id", host)
    const next = vi.fn()
    protectPrivateSpecificationRelations(req, response, next)
    expect(req.disallowed).toEqual([
      "secret",
      host[1],
      "product_specification",
      "product_specification_link",
      "product_specification_variant",
      "product_specification_variant_link",
    ])
    expect(host).toHaveLength(3)
    expect(next).toHaveBeenCalledOnce()
    const ordinary = request("id")
    protectPrivateSpecificationRelations(ordinary, response, next)
    expect(ordinary.disallowed).toHaveLength(4)
  })

  // These are the real pinned native validators/configuration, rather than a
  // second implementation of field filtering. No database or service is mocked.
  it.each([
    {
      name: "native Product retrieve",
      schema: AdminGetProductParams,
      config: retrieveProductQueryConfig,
      fields:
        "id,title,product_specification.current_revision.values,product_specification.current_revision.actor_id,product_specification.revisions.actor_id,variants.product_specification_variant.specification.current_revision.actor_id,product_specification_link.*",
      retained: ["id", "title"],
    },
    {
      name: "native nested Variant retrieve",
      schema: AdminGetProductVariantParams,
      config: retrieveVariantConfig,
      fields:
        "id,sku,product_specification_variant.specification.current_revision.values,product_specification_variant_link.*,product.product_specification.revisions.actor_id",
      retained: ["id", "sku"],
    },
    {
      name: "native Variant list",
      schema: AdminGetProductVariantsParams,
      config: listProductVariantQueryConfig,
      fields:
        "id,sku,product_specification_variant.specification.current_revision.values,product.product_specification.revisions.actor_id,*product_specification_variant",
      retained: ["id", "sku"],
    },
  ])(
    "blocks direct, nested, history and link fields in $name",
    async ({ schema, config, fields, retained }) => {
      const parser = validateAndTransformQuery(schema, config)
      const control = request(fields)
      await parser(control, response, (error) => {
        if (error) throw error
      })
      expect(
        control.queryConfig.fields.some((field) =>
          field.includes("product_specification")
        )
      ).toBe(true)
      const protectedRequest = request(fields)
      protectPrivateSpecificationRelations(protectedRequest, response, () => {})
      await parser(protectedRequest, response, (error) => {
        if (error) throw error
      })
      expect(protectedRequest.queryConfig.fields).toEqual(retained)
    }
  )

  it("keeps host regex restrictions and wins over an explicitly allowed private relation", async () => {
    const fields =
      "id,title,secret,internal_notes,product_specification.current_revision.actor_id"
    const req = request(fields, ["secret", /^internal_/])
    req.allowed = [
      "id",
      "title",
      "secret",
      "internal_notes",
      "product_specification.current_revision.actor_id",
    ]
    protectPrivateSpecificationRelations(req, response, () => {})
    await validateAndTransformQuery(
      AdminGetProductParams,
      retrieveProductQueryConfig
    )(req, response, (error) => {
      if (error) throw error
    })
    expect(req.queryConfig.fields).toEqual(["id", "title"])
  })

  it("preserves normal native Store fields while withholding raw owned relations", async () => {
    const req = request(
      "id,title,product_specification.current_revision.actor_id,variants.product_specification_variant.specification.revisions.values"
    )
    protectPrivateSpecificationRelations(req, response, () => {})
    await validateAndTransformQuery(
      StoreGetProductsParams,
      storeProductQueryConfig
    )(req, response, (error) => {
      if (error) throw error
    })
    expect(req.queryConfig.fields).toEqual(["id", "title"])
  })
})
