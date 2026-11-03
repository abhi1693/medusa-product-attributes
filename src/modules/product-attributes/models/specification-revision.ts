import { model } from "@medusajs/framework/utils"
import ProductSpecification from "./specification"

export default model
  .define("product_specification_revision", {
    id: model.id({ prefix: "psrev" }).primaryKey(),
    specification: model.belongsTo(() => ProductSpecification, {
      mappedBy: "revisions",
    }),
    groups: model.json(),
    version: model.number(),
    values: model.json(),
    variants: model.json(),
    actor_id: model.text(),
    current_for: model
      .hasOne(() => ProductSpecification, { mappedBy: "current_revision" })
      .nullable(),
  })
  .indexes([{ on: ["specification_id", "version"], unique: true }])
