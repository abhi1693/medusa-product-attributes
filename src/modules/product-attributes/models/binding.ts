import { model } from "@medusajs/framework/utils"
import AttributeTemplate from "./template"

export default model.define("product_attribute_binding", {
  id: model.id({ prefix: "pab" }).primaryKey(),
  product_id: model.text().unique(),
  template: model.belongsTo(() => AttributeTemplate, { mappedBy: "bindings" }),
  template_version: model.number(),
  version: model.number().default(1),
})
