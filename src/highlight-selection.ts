import type { AttributeField } from "./types"
export function effectiveHighlightKeys(
  keys: string[] | null | undefined,
  fields: AttributeField[]
) {
  return keys == null
    ? fields.slice(0, 6).map((field) => field.key)
    : keys.filter((key) => fields.some((field) => field.key === key))
}

export function resolvedHighlights(
  keys: string[] | null | undefined,
  fields: AttributeField[]
) {
  const byKey = new Map(fields.map((field) => [field.key, field]))
  return effectiveHighlightKeys(keys, fields).map((key) => byKey.get(key)!)
}
