import { vi } from "vitest"
import type { MedusaContainer } from "@medusajs/framework/types"
import type { OwnedSpecification, TemplateRevision } from "../../src/types"
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
export function harness(assigned = true) {
  const product = {
    id: "prod_test",
    title: "Example",
    status: "draft",
    updated_at: timestamp,
    metadata: { merchant_key: "preserved" },
    categories: [],
    variants: [
      {
        id: "variant_test",
        title: "Default",
        updated_at: timestamp,
        metadata: { merchant_key: "preserved" },
      },
    ],
  } as any
  const specification: OwnedSpecification | null = assigned
    ? {
        id: "pspec_test",
        product_id: product.id,
        groups: [{ template_id: template.id, template_version: 1 }],
        version: 1,
        revision_id: "psrev_1",
        linked: true,
        values: { model: "Example" },
        variants: { variant_test: { ports: 8 } },
      }
    : null
  const after = {
    ...(specification || {
      id: "pspec_test",
      product_id: product.id,
      groups: [{ template_id: template.id, template_version: 1 }],
      values: {},
      variants: {},
    }),
    version: 2,
    revision_id: "psrev_2",
    linked: true,
  }
  const service = {
    configuration: { metadata_key: "product_attributes" },
    specification: vi.fn().mockResolvedValue(specification),
    revision: vi.fn().mockResolvedValue(template),
    page: vi.fn().mockResolvedValue({ templates: [template] }),
    writeSpecification: vi.fn().mockResolvedValue({
      before: specification,
      after,
      created_variants: [],
    }),
    restoreSpecification: vi.fn(),
    confirmSpecification: vi.fn(),
  }
  const products = {
    retrieveProduct: vi.fn().mockResolvedValue(product),
    retrieveProductVariant: vi
      .fn()
      .mockResolvedValue({ product_id: product.id }),
  }
  const link = {
    create: vi.fn().mockResolvedValue([]),
    dismiss: vi.fn().mockResolvedValue([]),
  }
  const locking = {
    execute: vi.fn(async (_key: string, operation: () => unknown) =>
      operation()
    ),
  }
  const container = {
    resolve: vi.fn((key) =>
      key === "product"
        ? products
        : key === "locking"
          ? locking
          : key === "link"
            ? link
            : service
    ),
  } as unknown as MedusaContainer
  return { product, specification, service, products, locking, link, container }
}
