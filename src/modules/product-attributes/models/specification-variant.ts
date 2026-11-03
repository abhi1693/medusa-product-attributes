import { model } from "@medusajs/framework/utils"
import ProductSpecification from "./specification"

export default model.define("product_specification_variant", {
  id: model.id({ prefix: "psvar" }).primaryKey(),
  variant_id: model.text().unique(),
  specification: model.belongsTo(() => ProductSpecification, {
    mappedBy: "variant_references",
  }),
})
