import type {
  IProductModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { PRODUCT_ATTRIBUTES } from "../constants"
import type ProductAttributesService from "../modules/product-attributes/service"
import {
  readEnvelope,
  readVariantEnvelope,
  validateValues,
} from "../validation"
import type {
  MetadataEnvelope,
  ProductAttributes,
  TemplateRevision,
  ValidationIssue,
} from "../types"

export function envelope(
  metadata: unknown,
  namespace: string
): MetadataEnvelope | null {
  try {
    return readEnvelope(metadata, namespace)
  } catch {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid product attributes metadata envelope"
    )
  }
}
export function variantEnvelope(metadata: unknown, namespace: string) {
  try {
    return readVariantEnvelope(metadata, namespace)
  } catch {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid variant attributes metadata envelope"
    )
  }
}

export async function productState(
  container: MedusaContainer,
  productId: string
) {
  const product = await container
    .resolve<IProductModuleService>(Modules.PRODUCT)
    .retrieveProduct(productId, { relations: ["variants"] })
  const service =
    container.resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
  const binding = await service.binding(productId)
  const namespace = service.configuration.metadata_key
  const stored = envelope(product.metadata, namespace)
  if (
    Boolean(binding) !== Boolean(stored) ||
    (binding &&
      stored &&
      (binding.template_id !== stored.template_id ||
        binding.template_version !== stored.template_version ||
        binding.version !== stored.version))
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The template assignment does not match the protected metadata binding"
    )
  const template = binding
    ? await service.revision(binding.template_id, binding.template_version)
    : null
  return { product, service, binding, namespace, stored, template }
}

export function productIssues(
  template: TemplateRevision,
  product: {
    metadata?: unknown
    variants?: Array<{ id: string; metadata?: unknown }>
  },
  namespace: string,
  complete: boolean
): ValidationIssue[] {
  const stored = envelope(product.metadata, namespace)
  const issues = validateValues(
    template.fields,
    stored?.values || {},
    "product",
    complete
  )
  for (const variant of product.variants || [])
    issues.push(
      ...validateValues(
        template.fields,
        variantEnvelope(variant.metadata, namespace)?.values || {},
        "variant",
        complete,
        `variants.${variant.id}.values`
      )
    )
  return issues
}

export async function validateProduct(
  container: MedusaContainer,
  productId: string,
  complete?: boolean
) {
  const state = await productState(container, productId)
  if (!state.template) {
    if (
      state.product.variants?.some((variant) =>
        variantEnvelope(variant.metadata, state.namespace)
      )
    )
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Assign a product template before adding variant attributes"
      )
    return []
  }
  return productIssues(
    state.template,
    state.product,
    state.namespace,
    complete ?? state.product.status === "published"
  )
}

export async function enforceProduct(
  container: MedusaContainer,
  productId: string,
  complete?: boolean
) {
  const issues = await validateProduct(container, productId, complete)
  if (issues.length)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
    )
}

export const versionOf = (value: Date | string, revision = 0) =>
  `${new Date(value).toISOString()}:${revision}`

export async function productView(
  container: MedusaContainer,
  productId: string,
  canWrite: boolean
): Promise<ProductAttributes> {
  const { product, service, binding, namespace, stored, template } =
    await productState(container, productId)
  return {
    product_id: product.id,
    template,
    assignment_version: binding?.version || 0,
    version: versionOf(product.updated_at, binding?.version || 0),
    values: stored?.values || {},
    variants: (product.variants || []).map((variant) => {
      const stored = variantEnvelope(variant.metadata, namespace)
      return {
        id: variant.id,
        title: variant.title,
        version: versionOf(variant.updated_at, stored?.version || 0),
        values: stored?.values || {},
      }
    }),
    validation: template
      ? productIssues(template, product, namespace, true)
      : [],
    templates: (await service.page({ limit: 1000 })).templates,
    can_write: canWrite,
  }
}
