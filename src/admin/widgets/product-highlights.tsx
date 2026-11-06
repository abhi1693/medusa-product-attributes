import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { StorefrontHighlights } from "../components/highlights"
const ProductHighlights = ({ data }: DetailWidgetProps<AdminProduct>) => (
  <StorefrontHighlights productId={data.id} />
)
export const config = defineWidgetConfig({
  zone: "product.details",
  id: "product-attributes:storefront-highlights",
})
export default ProductHighlights
