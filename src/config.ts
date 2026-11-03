import { z } from "@medusajs/framework/zod"
import type { ModuleServiceInitializeOptions } from "@medusajs/framework/types"
import type { ProductAttributesOptions, TemplateDefinition } from "./types"

const key = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/)
  .refine(
    (value) => !["constructor", "prototype"].includes(value),
    "This key is reserved"
  )
const text = z.string().trim().min(1).max(100)
export const fieldSchema = z
  .object({
    key,
    label: text,
    help: z.string().trim().max(500).optional(),
    type: z.enum([
      "text",
      "number",
      "boolean",
      "single_select",
      "multi_select",
    ]),
    scope: z.enum(["product", "variant"]),
    required: z.boolean(),
    unit: z.string().trim().min(1).max(30).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    options: z
      .array(
        z
          .object({ value: z.string().trim().min(1).max(100), label: text })
          .strict()
      )
      .max(100)
      .optional(),
    searchable: z.boolean(),
    filterable: z.boolean(),
    comparable: z.boolean(),
  })
  .strict()
  .superRefine((field, context) => {
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    )
      context.addIssue({
        code: "custom",
        message: "Minimum must not exceed maximum",
      })
    if (
      field.type !== "number" &&
      (field.unit || field.min !== undefined || field.max !== undefined)
    )
      context.addIssue({
        code: "custom",
        message: "Units and bounds apply to numeric attributes",
      })
    const choices =
      field.type === "single_select" || field.type === "multi_select"
    if (choices !== Boolean(field.options?.length))
      context.addIssue({
        code: "custom",
        message:
          "Select attributes require options; other types cannot have them",
      })
    if (
      new Set(field.options?.map((option) => option.value)).size !==
      (field.options?.length || 0)
    )
      context.addIssue({
        code: "custom",
        message: "Option values must be unique",
      })
  })

export const templateSchema = z
  .object({
    key,
    name: text,
    description: z.string().trim().max(2000).default(""),
    category_ids: z.array(z.string().min(1).max(100)).max(100).default([]),
    fields: z.array(fieldSchema).min(1).max(100),
  })
  .strict()
  .superRefine((template, context) => {
    if (
      new Set(template.fields.map((field) => field.key)).size !==
      template.fields.length
    )
      context.addIssue({
        code: "custom",
        message: "Attribute keys must be unique within a template",
      })
    if (new Set(template.category_ids).size !== template.category_ids.length)
      context.addIssue({
        code: "custom",
        message: "Category IDs must be unique",
      })
  })

export function defineTemplate(
  definition: TemplateDefinition
): TemplateDefinition {
  return templateSchema.parse(definition)
}

export function resolveOptions(options: ProductAttributesOptions = {}) {
  const validated = z
    .object({
      metadata_key: key.default("product_attributes"),
      templates: z.array(templateSchema).max(1000).default([]),
      register_native_hooks: z.boolean().default(true),
      authorize: z
        .custom<NonNullable<ProductAttributesOptions["authorize"]>>(
          (entry) => typeof entry === "function",
          "Authorization adapter must be a function"
        )
        .optional(),
    })
    .strict()
    .parse(options)
  const templates = validated.templates
  if (
    new Set(templates.map((template) => template.key)).size !== templates.length
  )
    throw new Error("Configured template keys must be unique")
  return validated
}

// Medusa adds its own database connection options when loading an internal module.
// Leave those with the framework while strictly validating only our configuration.
export function resolveModuleOptions(
  options: ProductAttributesOptions &
    Partial<ModuleServiceInitializeOptions> = {}
) {
  const { database: _database, ...configuration } = options
  return resolveOptions(configuration)
}

export type { ProductAttributesOptions, TemplateDefinition } from "./types"
