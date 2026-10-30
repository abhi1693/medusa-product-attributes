export type AttributeType =
  "text" | "number" | "boolean" | "single_select" | "multi_select"

export type AttributeValue = string | number | boolean | string[] | null
export type AttributeValues = Record<string, AttributeValue>
export type AttributeOption = { value: string; label: string }
export type AttributeField = {
  key: string
  label: string
  type: AttributeType
  scope: "product" | "variant"
  required: boolean
  unit?: string
  min?: number
  max?: number
  options?: AttributeOption[]
  searchable: boolean
  filterable: boolean
  comparable: boolean
}
export type TemplateDefinition = {
  key: string
  name: string
  description?: string
  category_ids?: string[]
  fields: AttributeField[]
}
export type TemplateSummary = {
  id: string
  key: string
  name: string
  version: number
  source: "configuration" | "admin"
  archived: boolean
  category_ids?: string[]
  recommended?: boolean
}
export type TemplateRevision = TemplateSummary & {
  description: string
  category_ids: string[]
  fields: AttributeField[]
}
export type ValidationIssue = {
  path: string
  code: "required" | "type" | "unknown" | "range" | "choice" | "schema"
  message: string
}
export type ProductVariantAttributes = {
  id: string
  title: string
  version: string
  values: AttributeValues
}
export type ProductAttributes = {
  product_id: string
  template: TemplateRevision | null
  assignment_version: number
  version: string
  values: AttributeValues
  variants: ProductVariantAttributes[]
  validation: ValidationIssue[]
  templates: TemplateSummary[]
  can_write: boolean
}
export type StoreProductAttributes = {
  product_id: string
  template: Pick<TemplateRevision, "key" | "name" | "version" | "fields">
  values: AttributeValues
  variants: Array<{ id: string; values: AttributeValues }>
}
export type TemplateListResponse = {
  templates: TemplateSummary[]
  count: number
  offset: number
  limit: number
  can_write: boolean
}
export type TemplateResponse = {
  template: TemplateRevision
  revisions: TemplateRevision[]
  can_write: boolean
}
export type TemplateInput = TemplateDefinition & { version?: number }
export type ProductValuesInput = {
  version: string
  values?: AttributeValues
  variants?: Array<{ id: string; version: string; values: AttributeValues }>
}
export type TemplateAssignmentInput = {
  version: string
  template_id: string
  template_version: number
}
export type OwnedSpecification = {
  linked: boolean
  id: string
  product_id: string
  template_id: string
  template_version: number
  version: number
  revision_id: string
  values: AttributeValues
  variants: Record<string, AttributeValues>
}
export type SpecificationWriteInput = {
  product_id: string
  template_id: string
  template_version: number
  expected_version: number
  complete: boolean
  values: AttributeValues
  variants: Record<string, AttributeValues>
  actor_id: string
}
export type SpecificationWriteReceipt = {
  before: OwnedSpecification | null
  after: OwnedSpecification
  created_variants: Array<{ id: string; variant_id: string }>
}
export type AttributeAction =
  "templates.read" | "templates.write" | "values.read" | "values.write"
export type AuthorizationContext = {
  action: AttributeAction
  product_id?: string
  template_id?: string
}
export type ProductAttributesOptions = {
  metadata_key?: string
  templates?: TemplateDefinition[]
  register_native_hooks?: boolean
  authorize?: (
    request: unknown,
    context: AuthorizationContext
  ) => boolean | Promise<boolean>
}
export type {
  TemplateAssignmentsQuery,
  TemplateAssignmentsResponse,
} from "./template-assignments"
