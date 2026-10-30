import { model } from "@medusajs/framework/utils"
import AttributeRevision from "./revision"
import ProductSpecification from "./specification"
import SpecificationRevision from "./specification-revision"

export default model.define("product_attribute_template", {
  id: model.id({ prefix: "pat" }).primaryKey(),
  key: model.text().unique(),
  name: model.text(),
  version: model.number().default(1),
  source: model.enum(["configuration", "admin"]).default("admin"),
  archived: model.boolean().default(false),
  revisions: model.hasMany(() => AttributeRevision, { mappedBy: "template" }),
  specifications: model.hasMany(() => ProductSpecification, {
    mappedBy: "template",
  }),
  specification_revisions: model.hasMany(() => SpecificationRevision, {
    mappedBy: "template",
  }),
})
