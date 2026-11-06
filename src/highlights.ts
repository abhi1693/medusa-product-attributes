import { MedusaError } from "@medusajs/framework/utils"
import type { AttributeField } from "./types"

export function validateHighlightKeys(
  keys: string[] | null,
  fields: AttributeField[]
) {
  if (keys === null) return null
  if (
    !Array.isArray(keys) ||
    keys.length > 6 ||
    new Set(keys).size !== keys.length ||
    keys.some(
      (key) =>
        typeof key !== "string" || !fields.some((field) => field.key === key)
    )
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Choose up to six different attributes assigned to this product"
    )
  return keys
}
