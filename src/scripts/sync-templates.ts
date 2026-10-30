import type { ExecArgs } from "@medusajs/framework/types"
import { PRODUCT_ATTRIBUTES } from "../constants"
import type ProductAttributesService from "../modules/product-attributes/service"

export default async function synchronizeTemplates({ container }: ExecArgs) {
  const result = await container
    .resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
    .synchronize()
  console.info(
    `Synchronized product specification templates: ${result.changed} changes`
  )
}
