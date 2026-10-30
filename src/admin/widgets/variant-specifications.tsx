import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type {
  AdminProductVariant,
  DetailWidgetProps,
} from "@medusajs/framework/types"
import { useParams } from "react-router-dom"
import { Specifications } from "../components/specifications"

const VariantSpecifications = ({
  data,
}: DetailWidgetProps<AdminProductVariant>) => {
  const { id = "" } = useParams()
  return (
    <Specifications productId={data.product_id || id} variantId={data.id} />
  )
}

export const config = defineWidgetConfig({
  zone: "product_variant.details",
  id: "product-attributes:variant-specifications",
})
export default VariantSpecifications
