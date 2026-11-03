import type {
  IProductModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  updateProductsWorkflow,
  createProductVariantsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import { enforceProduct } from "./read"

export async function validateNativeProducts(
  input: { products: Array<{ id: string }> },
  context: { container: MedusaContainer }
) {
  for (const id of new Set(input.products.map((product) => product.id)))
    await enforceProduct(context.container, id)
}

export async function validateNativeVariants(
  input: { product_variants: Array<{ id: string }> },
  context: { container: MedusaContainer }
) {
  const products = context.container.resolve<IProductModuleService>(
    Modules.PRODUCT
  )
  const ids = new Set<string>()
  for (const variant of input.product_variants) {
    const record = await products.retrieveProductVariant(variant.id)
    if (record.product_id) ids.add(record.product_id)
  }
  for (const id of ids) await enforceProduct(context.container, id)
}

let registered = false
export function registerNativeValidation() {
  if (registered) return
  createProductsWorkflow.hooks.productsCreated(validateNativeProducts)
  updateProductsWorkflow.hooks.productsUpdated(validateNativeProducts)
  createProductVariantsWorkflow.hooks.productVariantsCreated(
    validateNativeVariants
  )
  updateProductVariantsWorkflow.hooks.productVariantsUpdated(
    validateNativeVariants
  )
  registered = true
}
