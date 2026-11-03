import type {
  ProductAttributes,
  ProductValuesInput,
  StoreProductAttributes,
  GroupAssignmentInput,
  TemplateInput,
  TemplateListResponse,
  TemplateResponse,
  ValidationIssue,
} from "./types"
import type {
  TemplateAssignmentsQuery,
  TemplateAssignmentsResponse,
} from "./template-assignments"

export type AttributesTransport = {
  fetch: <T>(
    path: string,
    options?: {
      method?: "POST"
      body?: Record<string, unknown>
      query?: Record<string, unknown>
    }
  ) => Promise<T>
}

export const createProductAttributesClient = (
  transport: AttributesTransport
) => {
  const root = "/admin/product-attributes"
  const templatePath = (id: string) =>
    `${root}/templates/${encodeURIComponent(id)}`
  const productPath = (id: string) =>
    `${root}/products/${encodeURIComponent(id)}`
  return {
    templates: (
      query: {
        q?: string
        offset?: number
        limit?: number
        include_archived?: boolean
      } = {}
    ) => transport.fetch<TemplateListResponse>(`${root}/templates`, { query }),
    template: (id: string) =>
      transport.fetch<TemplateResponse>(templatePath(id)),
    templateProducts: (id: string, query: TemplateAssignmentsQuery = {}) =>
      transport.fetch<TemplateAssignmentsResponse>(
        `${templatePath(id)}/products`,
        { query }
      ),
    createTemplate: (body: TemplateInput) =>
      transport.fetch<TemplateResponse>(`${root}/templates`, {
        method: "POST",
        body,
      }),
    reviseTemplate: (id: string, body: TemplateInput) =>
      transport.fetch<TemplateResponse>(templatePath(id), {
        method: "POST",
        body,
      }),
    archiveTemplate: (id: string, version: number) =>
      transport.fetch<TemplateResponse>(`${templatePath(id)}/archive`, {
        method: "POST",
        body: { version },
      }),
    product: (id: string) =>
      transport.fetch<ProductAttributes>(productPath(id)),
    storeProduct: (id: string) =>
      transport.fetch<StoreProductAttributes>(
        `/store/products/${encodeURIComponent(id)}/attributes`
      ),
    assignGroups: (id: string, body: GroupAssignmentInput) =>
      transport.fetch<ProductAttributes>(`${productPath(id)}/groups`, {
        method: "POST",
        body,
      }),
    saveValues: (id: string, body: ProductValuesInput) =>
      transport.fetch<ProductAttributes>(`${productPath(id)}/values`, {
        method: "POST",
        body,
      }),
    exportMetadata: (id: string, version: string) =>
      transport.fetch<{ revision_id: string }>(`${productPath(id)}/export`, {
        method: "POST",
        body: { version },
      }),
    validate: (id: string) =>
      transport.fetch<{ validation: ValidationIssue[] }>(
        `${productPath(id)}/validate`,
        {
          method: "POST",
        }
      ),
  }
}

export type ProductAttributesClient = ReturnType<
  typeof createProductAttributesClient
>
