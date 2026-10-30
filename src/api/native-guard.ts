import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { isRecord } from "../validation"
import { enforceProduct } from "../workflows/read"

export async function validateNativeProductPublication(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const body = isRecord(req.body) ? req.body : {}
  const ids = new Set<string>()
  if (body.status === "published") {
    const parts = req.path.split("/")
    if (
      parts[2]?.toLowerCase() === "products" &&
      parts[3] &&
      !["batch", "import", "imports", "export", "export-fields"].includes(
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
  }
  if (Array.isArray(body.update))
    for (const item of body.update)
      if (
        isRecord(item) &&
        typeof item.id === "string" &&
        item.status === "published"
      )
        ids.add(item.id)
  for (const id of ids) await enforceProduct(req.scope, id, true)
  next()
}
