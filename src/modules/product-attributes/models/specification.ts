import { model } from "@medusajs/framework/utils"
import AttributeTemplate from "./template"
import SpecificationRevision from "./specification-revision"
import SpecificationVariant from "./specification-variant"

export default model
  .define("product_specification", {
    id: model.id({ prefix: "pspec" }).primaryKey(),
    product_id: model.text().unique(),
    template: model.belongsTo(() => AttributeTemplate, {
      mappedBy: "specifications",
    }),
    template_version: model.number(),
    version: model.number().default(1),
    linked: model.boolean().default(false),
    current_revision: model
      .belongsTo(() => SpecificationRevision, { mappedBy: "current_for" })
      .nullable(),
    revisions: model.hasMany(() => SpecificationRevision, {
      mappedBy: "specification",
    }),
    variant_references: model.hasMany(() => SpecificationVariant, {
      mappedBy: "specification",
    }),
  })
  .cascades({ delete: ["revisions", "variant_references"] })
