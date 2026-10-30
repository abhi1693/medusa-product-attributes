import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { PRODUCT_ATTRIBUTES } from "../constants"
import type ProductAttributesService from "../modules/product-attributes/service"
import { isRecord } from "../validation"
import { enforceProduct } from "../workflows/read"

export function metadataMutation(
  value: unknown,
  namespace: string
): "reserved" | "clear" | null {
  let clearing = false
  if (Array.isArray(value)) {
    for (const item of value) {
      const mutation = metadataMutation(item, namespace)
      if (mutation === "reserved") return mutation
      if (mutation === "clear") clearing = true
    }
  } else if (isRecord(value)) {
    if (Object.hasOwn(value, "metadata")) {
      if (isRecord(value.metadata) && Object.hasOwn(value.metadata, namespace))
        return "reserved"
      if (value.metadata === null || value.metadata === "") clearing = true
    }
    for (const [key, item] of Object.entries(value)) {
      if (key === "metadata") continue
      const mutation = metadataMutation(item, namespace)
      if (mutation === "reserved") return mutation
      if (mutation === "clear") clearing = true
    }
  }
  return clearing ? "clear" : null
}

export async function protectNativeProductWrites(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const service =
    req.scope.resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
  const mutation = metadataMutation(
    req.body,
    service.configuration.metadata_key
  )
  if (mutation === "reserved")
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Use the product attributes API to edit the protected metadata namespace"
    )
  const parts = req.path.split("/")
  const ids = new Set<string>()
  if (
    parts[2].toLowerCase() === "products" &&
    parts[3] &&
    !["batch", "import", "export", "export-fields"].includes(
      parts[3].toLowerCase()
    )
  ) {
    try {
      ids.add(decodeURIComponent(parts[3]))
    } catch {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Malformed product identifier"
      )
    }
  }
  const body = isRecord(req.body) ? req.body : {}
  if (Array.isArray(body.update))
    for (const item of body.update)
      if (isRecord(item) && typeof item.id === "string") ids.add(item.id)
  for (const id of ids) {
    const binding = await service.binding(id)
    if (!binding) continue
    if (mutation === "clear")
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Metadata clearing would remove protected attributes; clear individual values through the attributes API"
      )
    if (
      body.status === "published" ||
      (Array.isArray(body.update) &&
        body.update.some(
          (item: unknown) =>
            isRecord(item) && item.id === id && item.status === "published"
        ))
    )
      await enforceProduct(req.scope, id, true)
  }
  next()
}
