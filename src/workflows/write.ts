import type {
  IProductModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
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
  AttributeValues,
  ProductValuesInput,
  GroupAssignmentInput,
  SpecificationWriteInput,
  SpecificationWriteReceipt,
} from "../types"
import { mergeValues } from "../validation"
import {
  productIssues,
  productState,
  productView,
  specificationSnapshot,
  specificationVersion,
} from "./read"

export type AttributesMutation = { product_id: string; actor_id?: string } & (
  | { assignment: GroupAssignmentInput; values?: ProductValuesInput }
  | { assignment?: never; values: ProductValuesInput }
)

export async function prepareAttributesMutation(
  input: AttributesMutation,
  { container }: { container: MedusaContainer }
) {
  const {
    product,
    service,
    specification,
    groups: previous,
  } = await productState(container, input.product_id)
  const currentVersion = specificationVersion(specification)
  if (
    (input.assignment && input.assignment.version !== currentVersion) ||
    (input.values && input.values.version !== currentVersion)
  )
    conflict()
  if (!input.assignment && !specification)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Assign specification groups before editing values"
    )
  const assignments = input.assignment
    ? input.assignment.groups
    : specification!.groups
  if (
    assignments.length > 30 ||
    new Set(assignments.map((group) => group.template_id)).size !==
      assignments.length
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Choose each specification group only once (maximum 30)"
    )
  const groups = input.assignment
    ? await Promise.all(
        assignments.map((group) =>
          service.revision(group.template_id, group.template_version)
        )
      )
    : previous
  if (
    input.assignment &&
    groups.some(
      (group) =>
        group.archived &&
        !specification?.groups.some(
          (old) =>
            old.template_id === group.id &&
            old.template_version === group.version
        )
    )
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Archived groups cannot be assigned"
    )
  const fields = groups.flatMap((group) => group.fields)
  if (new Set(fields.map((field) => field.key)).size !== fields.length)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Groups contain duplicate field keys; each fact must have one owning group"
    )
  const retained = (values: AttributeValues) =>
    Object.fromEntries(
      Object.entries(values).filter(([key]) =>
        fields.some((field) => field.key === key)
      )
    )
  const patches = input.values?.variants || []
  if (new Set(patches.map((patch) => patch.id)).size !== patches.length)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Variant IDs must be unique"
    )
  const variants: Record<string, AttributeValues> = {}
  for (const variant of product.variants || []) {
    const patch = patches.find((patch) => patch.id === variant.id)
    if (patch && patch.version !== specificationVersion(specification))
      conflict()
    variants[variant.id] = mergeValues(
      retained(specification?.variants[variant.id] || {}),
      patch?.values || {}
    )
  }
  if (patches.some((patch) => !Object.hasOwn(variants, patch.id)))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A variant does not belong to this product"
    )
  const values = mergeValues(
    retained(specification?.values || {}),
    input.values?.values || {}
  )
  const complete = product.status === "published"
  const issues = productIssues(
    { fields },
    {
      values,
      variants: Object.entries(variants).map(([id, values]) => ({
        id,
        values,
      })),
    },
    complete
  )
  if (issues.length)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
    )
  return new StepResponse<SpecificationWriteInput>({
    product_id: product.id,
    groups: assignments,
    expected_version: specification?.version || 0,
    complete,
    values,
    variants,
    actor_id: input.actor_id || "system:workflow",
  })
}
const prepare = createStep(
  "prepare-product-specification",
  prepareAttributesMutation
)
export async function writeSpecification(
  input: SpecificationWriteInput,
  { container }: { container: MedusaContainer }
) {
  const receipt = await container
    .resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
    .writeSpecification(input)
  return new StepResponse(receipt, receipt)
}
export async function restoreSpecification(
  receipt: SpecificationWriteReceipt | undefined,
  { container }: { container: MedusaContainer }
) {
  if (receipt)
    await container
      .resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
      .restoreSpecification(receipt)
}
const write = createStep(
  "write-owned-product-specification",
  writeSpecification,
  restoreSpecification
)
export function specificationLinks({
  receipt,
}: {
  receipt: SpecificationWriteReceipt
}) {
  return [
    ...(!receipt.before
      ? [
          {
            [Modules.PRODUCT]: { product_id: receipt.after.product_id },
            [PRODUCT_ATTRIBUTES]: {
              product_specification_id: receipt.after.id,
            },
          },
        ]
      : []),
    ...receipt.created_variants.map((reference) => ({
      [Modules.PRODUCT]: { product_variant_id: reference.variant_id },
      [PRODUCT_ATTRIBUTES]: { product_specification_variant_id: reference.id },
    })),
  ]
}
export type SpecificationLinks = ReturnType<typeof specificationLinks>
export async function createSpecificationLinks(
  input: SpecificationLinks,
  { container }: { container: MedusaContainer }
) {
  try {
    if (input.length)
      await container.resolve(ContainerRegistrationKeys.LINK).create(input)
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unable to link product specifications"
    return StepResponse.permanentFailure(message, input)
  }
  return new StepResponse(input, input)
}
export async function dismissSpecificationLinks(
  input: SpecificationLinks | undefined,
  { container }: { container: MedusaContainer }
) {
  if (input?.length)
    await container.resolve(ContainerRegistrationKeys.LINK).dismiss(input)
}
const createLinks = createStep(
  "create-product-specification-links",
  createSpecificationLinks,
  dismissSpecificationLinks
)
export const confirmationInput = ({
  receipt,
}: {
  receipt: SpecificationWriteReceipt
}) => receipt.after
export async function confirmSpecification(
  input: SpecificationWriteReceipt["after"],
  { container }: { container: MedusaContainer }
) {
  const products = container.resolve<IProductModuleService>(Modules.PRODUCT)
  const product = await products.retrieveProduct(input.product_id, {
    relations: ["variants"],
  })
  const service =
    container.resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
  const groups = await Promise.all(
    input.groups.map((group) =>
      service.revision(group.template_id, group.template_version)
    )
  )
  const issues = productIssues(
    { fields: groups.flatMap((group) => group.fields) },
    specificationSnapshot(product, input),
    product.status === "published"
  )
  if (issues.length)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
    )
  await service.confirmSpecification(input.product_id, input.revision_id)
  return new StepResponse(input.product_id)
}
const confirm = createStep(
  "confirm-product-specification-links",
  confirmSpecification
)
export const writeAttributesWorkflow = createWorkflow(
  "write-product-attributes",
  (input: AttributesMutation) => {
    const receipt = write(prepare(input))
    const links = createLinks(transform({ receipt }, specificationLinks))
    const productId = confirm(transform({ receipt, links }, confirmationInput))
    return new WorkflowResponse({ product_id: productId })
  }
)
export async function mutateProductAttributes(
  container: MedusaContainer,
  input: AttributesMutation,
  canWrite = true,
  actorId = "system:workflow"
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
      await writeAttributesWorkflow(container).run({
        input: { ...input, actor_id: actorId },
      })
      return productView(container, input.product_id, canWrite)
    },
    { timeout: 10 }
  )
}

// Explicit, one-way export. Its native workflow may fail or become stale without
// changing the authoritative immutable specification revision.
export async function exportProductAttributesMetadata(
  container: MedusaContainer,
  productId: string,
  version: string
) {
  const state = await productState(container, productId)
  if (!state.specification)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Assign specification groups before exporting specifications"
    )
  if (specificationVersion(state.specification) !== version) conflict()
  const source = state.specification
  const projection = {
    revision_id: source.revision_id,
    groups: source.groups,
    values: source.values,
  }
  await updateProductsWorkflow(container).run({
    input: {
      products: [
        { id: productId, metadata: { [state.namespace]: projection } },
      ],
    },
  })
  await updateProductVariantsWorkflow(container).run({
    input: {
      product_variants: (state.product.variants || []).map((variant) => ({
        id: variant.id,
        metadata: {
          [state.namespace]: {
            revision_id: source.revision_id,
            values: source.variants[variant.id] || {},
          },
        },
      })),
    },
  })
  return { revision_id: source.revision_id }
}
