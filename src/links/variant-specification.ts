import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import ProductAttributesModule from "../modules/product-attributes"

export default defineLink(ProductModule.linkable.productVariant, {
  linkable: ProductAttributesModule.linkable.productSpecificationVariant,
  alias: "product_specification_variant",
  deleteCascade: true,
})
