import type {
  IProductModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { Modules, MedusaError } from "@medusajs/framework/utils"
import { PRODUCT_ATTRIBUTES } from "../constants"
import type ProductAttributesService from "../modules/product-attributes/service"
import type {
  AttributeValues,
  OwnedSpecification,
  ProductAttributes,
  TemplateRevision,
  ValidationIssue,
} from "../types"
import { applicableTemplate, validateValues } from "../validation"

export async function productState(
  container: MedusaContainer,
  productId: string
) {
  const product = await container
    .resolve<IProductModuleService>(Modules.PRODUCT)
    .retrieveProduct(productId, { relations: ["variants", "categories"] })
  const service =
    container.resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
  const specification = await service.specification(productId)
  const groups = await Promise.all(
    (specification?.groups || []).map((group) =>
      service
        .revision(group.template_id, group.template_version)
        .then((template) => applicableTemplate(template, group))
    )
  )
  return {
    product,
    service,
    specification,
    groups,
    namespace: service.configuration.metadata_key,
  }
}

export function productIssues(
  template: Pick<TemplateRevision, "fields">,
  snapshot: {
    values: AttributeValues
    variants: Array<{ id: string; values: AttributeValues }>
  },
  complete: boolean
): ValidationIssue[] {
  return [
    ...validateValues(template.fields, snapshot.values, "product", complete),
    ...snapshot.variants.flatMap((variant) =>
      validateValues(
        template.fields,
        variant.values,
        "variant",
        complete,
        `variants.${variant.id}.values`
      )
    ),
  ]
}

export function specificationSnapshot(
  product: { variants?: Array<{ id: string }> },
  specification: OwnedSpecification
) {
  return {
    values: specification.values,
    variants: (product.variants || []).map((variant) => ({
      id: variant.id,
      values: specification.variants[variant.id] || {},
    })),
  }
}

export async function validateProduct(
  container: MedusaContainer,
  productId: string,
  complete?: boolean
) {
  const state = await productState(container, productId)
  return state.specification
    ? productIssues(
        { fields: state.groups.flatMap((group) => group.fields) },
        specificationSnapshot(state.product, state.specification),
        complete ?? state.product.status === "published"
      )
    : []
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
export const specificationVersion = (
  specification: OwnedSpecification | null
) => specification?.revision_id || "unassigned"

export async function productView(
  container: MedusaContainer,
  productId: string,
  canWrite: boolean,
  canReadTemplates = true
): Promise<ProductAttributes> {
  const { product, service, specification, groups } = await productState(
    container,
    productId
  )
  const version = specificationVersion(specification)
  const categoryIds = new Set(
    product.categories?.map((category) => category.id)
  )
  return {
    product_id: product.id,
    groups,
    assignment_version: specification?.version || 0,
    version,
    values: specification?.values || {},
    variants: (product.variants || []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      version,
      values: specification?.variants[variant.id] || {},
    })),
    validation: specification
      ? productIssues(
          { fields: groups.flatMap((group) => group.fields) },
          specificationSnapshot(product, specification),
          true
        )
      : [],
    templates: canReadTemplates
      ? (await service.page({ limit: 1000 })).templates.map((template) => ({
          ...template,
          recommended: Boolean(
            template.category_ids?.some((id) => categoryIds.has(id))
          ),
        }))
      : [],
    can_write: canWrite,
    can_assign: canWrite && canReadTemplates,
  }
}
