import type {
  AttributeField,
  AttributeValues,
  MetadataEnvelope,
  VariantMetadataEnvelope,
  ValidationIssue,
} from "./types"

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function readEnvelope(
  metadata: unknown,
  namespace = "product_attributes"
): MetadataEnvelope | null {
  if (!isRecord(metadata) || !Object.hasOwn(metadata, namespace)) return null
  const value = metadata[namespace]
  if (
    !isRecord(value) ||
    ["template_id", "template_version", "version", "values"].some(
      (key) => !Object.hasOwn(value, key)
    ) ||
    typeof value.template_id !== "string" ||
    !value.template_id ||
    !Number.isSafeInteger(value.template_version) ||
    Number(value.template_version) < 1 ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    !isRecord(value.values) ||
    Object.keys(value).some(
      (key) =>
        !["template_id", "template_version", "version", "values"].includes(key)
    )
  )
    throw new Error("Invalid product attributes metadata envelope")
  return value as MetadataEnvelope
}

export function readVariantEnvelope(
  metadata: unknown,
  namespace = "product_attributes"
): VariantMetadataEnvelope | null {
  if (!isRecord(metadata) || !Object.hasOwn(metadata, namespace)) return null
  const value = metadata[namespace]
  if (
    !isRecord(value) ||
    ["version", "values"].some((key) => !Object.hasOwn(value, key)) ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    !isRecord(value.values) ||
    Object.keys(value).some((key) => !["version", "values"].includes(key))
  )
    throw new Error("Invalid variant attributes metadata envelope")
  return value as VariantMetadataEnvelope
}

export function mergeValues(
  current: AttributeValues,
  patch: AttributeValues
): AttributeValues {
  const merged = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key]
    else
      Object.defineProperty(merged, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      })
  }
  return merged
}

export function validateValues(
  fields: AttributeField[],
  values: unknown,
  scope: "product" | "variant",
  complete = false,
  prefix = "values"
): ValidationIssue[] {
  if (!isRecord(values))
    return [{ path: prefix, code: "type", message: "Values must be an object" }]
  const issues: ValidationIssue[] = []
  const definitions = new Map(
    fields
      .filter((field) => field.scope === scope)
      .map((field) => [field.key, field])
  )
  for (const key of Object.keys(values))
    if (!definitions.has(key))
      issues.push({
        path: `${prefix}.${key}`,
        code: "unknown",
        message: "This attribute is not defined for this scope",
      })
  for (const [key, field] of definitions) {
    const value = Object.hasOwn(values, key) ? values[key] : undefined
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && !value.length)
    if (missing) {
      if (complete && field.required)
        issues.push({
          path: `${prefix}.${key}`,
          code: "required",
          message: `${field.label} is required`,
        })
      continue
    }
    const path = `${prefix}.${key}`
    const issue = (code: ValidationIssue["code"], message: string) =>
      issues.push({ path, code, message })
    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value))
        issue("type", "Enter a finite number in the declared unit")
      else if (
        (field.min !== undefined && value < field.min) ||
        (field.max !== undefined && value > field.max)
      )
        issue("range", "The number is outside the allowed range")
    } else if (field.type === "boolean") {
      if (typeof value !== "boolean") issue("type", "Choose a boolean value")
    } else if (field.type === "text") {
      if (typeof value !== "string" || value.length > 2000)
        issue("type", "Enter text of at most 2000 characters")
    } else {
      const allowed = new Set(field.options?.map((option) => option.value))
      if (field.type === "single_select") {
        if (typeof value !== "string" || !allowed.has(value))
          issue("choice", "Choose an available option")
      } else if (
        !Array.isArray(value) ||
        value.length > 100 ||
        value.some(
          (entry) => typeof entry !== "string" || !allowed.has(entry)
        ) ||
        new Set(value).size !== value.length
      )
        issue("choice", "Choose unique available options")
    }
  }
  return issues
}
