import { vi } from "vitest"
import type { MedusaContainer } from "@medusajs/framework/types"
import type { TemplateRevision } from "../../src/types"

export const template: TemplateRevision = {
  id: "pat_test",
  key: "network",
  name: "Network",
  version: 1,
  source: "admin",
  archived: false,
  description: "",
  category_ids: [],
  fields: [
    {
      key: "model",
      label: "Model",
      type: "text",
      scope: "product",
      required: true,
      searchable: true,
      filterable: false,
      comparable: true,
    },
    {
      key: "ports",
      label: "Ports",
      type: "number",
      scope: "variant",
      required: true,
      unit: "ports",
      min: 0,
      max: 100,
      searchable: false,
      filterable: true,
      comparable: true,
    },
  ],
}
export const timestamp = "2026-10-30T00:00:00.000Z"
export const stored = {
  template_id: template.id,
  template_version: 1,
  version: 1,
  values: { model: "Example" },
}
export function harness(assigned = true) {
  const product = {
    id: "prod_test",
    title: "Example",
    status: "draft",
    updated_at: timestamp,
    metadata: {
      other: "preserved",
      ...(assigned ? { product_attributes: structuredClone(stored) } : {}),
    },
    variants: [
      {
        id: "variant_test",
        title: "Default",
        updated_at: timestamp,
        metadata: {
          other: "preserved",
          ...(assigned
            ? { product_attributes: { version: 1, values: { ports: 8 } } }
            : {}),
        },
      },
    ],
  } as any
  const binding = assigned
    ? {
        id: "pab_test",
        product_id: product.id,
        template_id: template.id,
        template_version: 1,
        version: 1,
      }
    : null
  const service = {
    configuration: { metadata_key: "product_attributes" },
    binding: vi.fn().mockResolvedValue(binding),
    revision: vi.fn().mockResolvedValue(template),
    page: vi.fn().mockResolvedValue({ templates: [template] }),
    reserveBinding: vi.fn().mockResolvedValue({
      before: binding,
      after: {
        ...(binding || {
          id: "pab_test",
          product_id: product.id,
          template_id: template.id,
          template_version: 1,
        }),
        version: 2,
      },
    }),
    restoreBinding: vi.fn(),
  }
  const products = {
    retrieveProduct: vi.fn().mockResolvedValue(product),
    retrieveProductVariant: vi
      .fn()
      .mockResolvedValue({ product_id: product.id }),
  }
  const locking = {
    execute: vi.fn(async (_key: string, operation: () => unknown) =>
      operation()
    ),
  }
  const container = {
    resolve: vi.fn((key) =>
      key === "product" ? products : key === "locking" ? locking : service
    ),
  } as unknown as MedusaContainer
  return { product, binding, service, products, locking, container }
}
