import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Specifications } from "../components/specifications"

const ProductSpecifications = ({ data }: DetailWidgetProps<AdminProduct>) => (
  <Specifications productId={data.id} />
)

export const config = defineWidgetConfig({
  zone: "product.details",
  id: "product-attributes:product-specifications",
})
export default ProductSpecifications
