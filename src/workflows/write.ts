import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  StepResponse,
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import {
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import { PRODUCT_ATTRIBUTES } from "../constants"
import type ProductAttributesService from "../modules/product-attributes/service"
import { conflict } from "../modules/product-attributes/service"
import type {
  ProductTemplateBinding,
  ProductValuesInput,
  TemplateAssignmentInput,
} from "../types"
import { mergeValues } from "../validation"
import {
  variantEnvelope,
  productIssues,
  productState,
  productView,
  versionOf,
} from "./read"

export type AttributesMutation = { product_id: string } & (
  | { assignment: TemplateAssignmentInput; values?: never }
  | { assignment?: never; values: ProductValuesInput }
)
export async function prepareAttributesMutation(
  input: AttributesMutation,
  { container }: { container: MedusaContainer }
) {
  const {
    product,
    service,
    binding,
    namespace,
    stored,
    template: previous,
  } = await productState(container, input.product_id)
  const request = input.assignment || input.values
  if (versionOf(product.updated_at, binding?.version || 0) !== request.version)
    conflict()
  const template = input.assignment
    ? await service.revision(
        input.assignment.template_id,
        input.assignment.template_version
      )
    : previous
  if (!template)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Assign a template before editing attributes"
    )
  if (input.assignment && template.archived)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Archived templates cannot be assigned"
    )
  const next = {
    template_id: template.id,
    template_version: template.version,
    version: (binding?.version || 0) + 1,
    values: mergeValues(stored?.values || {}, input.values?.values || {}),
  }
  const patches = input.values?.variants || []
  if (new Set(patches.map((patch) => patch.id)).size !== patches.length)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Variant IDs must be unique"
    )
  const variants = (product.variants || []).map((variant) => {
    const patch = patches.find((entry) => entry.id === variant.id)
    const previous = variantEnvelope(variant.metadata, namespace)
    if (
      patch &&
      versionOf(variant.updated_at, previous?.version || 0) !== patch.version
    )
      conflict()
    return {
      ...variant,
      metadata: {
        ...variant.metadata,
        [namespace]: {
          version: (previous?.version || 0) + 1,
          values: mergeValues(previous?.values || {}, patch?.values || {}),
        },
      },
    }
  })
  if (
    patches.some(
      (patch) => !variants.some((variant) => variant.id === patch.id)
    )
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A variant does not belong to this product"
    )
  const candidate = {
    ...product,
    metadata: { ...product.metadata, [namespace]: next },
    variants,
  }
  const issues = productIssues(
    template,
    candidate,
    namespace,
    product.status === "published"
  )
  if (issues.length)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
    )
  return new StepResponse({
    product_id: product.id,
    products: [{ id: product.id, metadata: { [namespace]: next } }],
    variants: variants
      .filter((variant) => patches.some((patch) => patch.id === variant.id))
      .map((variant) => ({
        id: variant.id,
        metadata: { [namespace]: variant.metadata[namespace] },
      })),
    template_id: template.id,
    template_version: template.version,
    binding_version: binding?.version || 0,
  })
}

const prepare = createStep(
  "prepare-product-attributes",
  prepareAttributesMutation
)

export async function reserveAttributesBinding(
  input: {
    product_id: string
    template_id: string
    template_version: number
    binding_version: number
  },
  { container }: { container: MedusaContainer }
) {
  const receipt = await container
    .resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
    .reserveBinding(
      input.product_id,
      input.template_id,
      input.template_version,
      input.binding_version
    )
  return new StepResponse(receipt.after.product_id, receipt)
}

export async function restoreAttributesBinding(
  receipt:
    | { before: ProductTemplateBinding | null; after: ProductTemplateBinding }
    | undefined,
  { container }: { container: MedusaContainer }
) {
  if (receipt)
    await container
      .resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
      .restoreBinding(receipt)
}

const reserve = createStep(
  "reserve-product-template-binding",
  reserveAttributesBinding,
  restoreAttributesBinding
)

export const productMutationInput = ({
  plan,
}: {
  plan: Awaited<ReturnType<typeof prepareAttributesMutation>>["output"]
}) => ({ products: plan.products })
export const variantMutationInput = ({
  plan,
}: {
  plan: Awaited<ReturnType<typeof prepareAttributesMutation>>["output"]
}) => ({ product_variants: plan.variants })

export const writeAttributesWorkflow = createWorkflow(
  "write-product-attributes",
  (input: AttributesMutation) => {
    const plan = prepare(input)
    const reserved = reserve(plan)
    // The metadata update depends on the binding reservation. Native compensation
    // restores product/variant snapshots before the reservation is compensated.
    const productInput = transform({ plan, reserved }, productMutationInput)
    const products = updateProductsWorkflow
      .runAsStep({ input: productInput })
      .config({ name: "write-product-attribute-metadata" })
    const variantInput = transform({ plan, products }, variantMutationInput)
    const variants = updateProductVariantsWorkflow
      .runAsStep({ input: variantInput })
      .config({ name: "write-variant-attribute-metadata" })
    return new WorkflowResponse({ product_id: reserved, products, variants })
  }
)

export async function mutateProductAttributes(
  container: MedusaContainer,
  input: AttributesMutation,
  canWrite = true
) {
  const locking = container.resolve<{
    execute<T>(
      key: string,
      operation: () => Promise<T>,
      options?: { timeout?: number }
    ): Promise<T>
  }>(Modules.LOCKING)
  return locking.execute(
    `product-attributes:${input.product_id}`,
    async () => {
      await writeAttributesWorkflow(container).run({ input })
      return productView(container, input.product_id, canWrite)
    },
    { timeout: 10 }
  )
}
