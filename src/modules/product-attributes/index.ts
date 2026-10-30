import { Module } from "@medusajs/framework/utils"
import ProductAttributesService from "./service"
import loadNativeValidation from "./loaders/native-validation"

import { PRODUCT_ATTRIBUTES } from "../../constants"
export { PRODUCT_ATTRIBUTES } from "../../constants"
export default Module(PRODUCT_ATTRIBUTES, {
  service: ProductAttributesService,
  loaders: [loadNativeValidation],
})
