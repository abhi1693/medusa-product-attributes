import { model } from "@medusajs/framework/utils"
import AttributeTemplate from "./template"

export default model
  .define("product_attribute_revision", {
    id: model.id({ prefix: "par" }).primaryKey(),
    template: model.belongsTo(() => AttributeTemplate, {
      mappedBy: "revisions",
    }),
    version: model.number(),
    definition: model.json(),
    actor_id: model.text(),
  })
  .indexes([{ on: ["template_id", "version"], unique: true }])
