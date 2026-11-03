import type {
  AuthenticatedMedusaRequest,
  MedusaStoreRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { PRODUCT_ATTRIBUTES } from "../constants"
import type ProductAttributesService from "../modules/product-attributes/service"
import { templateSchema } from "../config"
import {
  productView,
  productState,
  productIssues,
  validateProduct,
} from "../workflows/read"
import type { StoreProductAttributes } from "../types"
import { isRecord } from "../validation"
import {
  mutateProductAttributes,
  exportProductAttributesMetadata,
} from "../workflows/write"
import { allowed, authorize } from "./authorization"

const version = z.string().min(1).max(200)
const value = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(100)).max(100),
  z.null(),
])
const values = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), value)
const pageSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    include_archived: z
      .enum(["true", "false"])
      .optional()
      .transform((entry) => entry === "true"),
  })
  .strict()
const assignmentSchema = z
  .object({
    version,
    groups: z
      .array(
        z
          .object({
            template_id: z.string().min(1).max(100),
            template_version: z.number().int().min(1),
            field_keys: z
              .array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/))
              .min(1)
              .max(100)
              .optional(),
          })
          .strict()
      )
      .max(30),
  })
  .strict()
const valuesSchema = z
  .object({
    version,
    values: values.optional(),
    variants: z
      .array(
        z.object({ id: z.string().min(1).max(100), version, values }).strict()
      )
      .max(100)
      .optional(),
  })
  .strict()
const revisionSchema = z.object({ version: z.number().int().min(1) }).strict()
const exportSchema = z.object({ version }).strict()

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")
    )
  return result.data
}

export async function listTemplates(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, { action: "templates.read" })
  const result = await req.scope
    .resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
    .page(parse(pageSchema, req.query))
  res.json({
    ...result,
    can_write: await allowed(req, { action: "templates.write" }),
  })
}
export async function getTemplate(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, { action: "templates.read", template_id: req.params.id })
  const service =
    req.scope.resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
  res.json({
    template: await service.revision(req.params.id),
    revisions: await service.history(req.params.id),
    can_write: await allowed(req, {
      action: "templates.write",
      template_id: req.params.id,
    }),
  })
}
export async function saveTemplate(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, {
    action: "templates.write",
    template_id: req.params.id,
  })
  if (!isRecord(req.body))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Template input must be an object"
    )
  const body = req.body
  const { version: expected, ...definition } = body
  const input = parse(templateSchema, definition)
  const expectedVersion = req.params.id
    ? parse(revisionSchema, { version: expected }).version
    : undefined
  const service =
    req.scope.resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
  const template = await service.save(
    input,
    req.auth_context.actor_id,
    req.params.id,
    expectedVersion
  )
  res.json({
    template,
    revisions: await service.history(template.id),
    can_write: true,
  })
}
export async function archiveTemplate(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, {
    action: "templates.write",
    template_id: req.params.id,
  })
  const input = parse(revisionSchema, req.body)
  const service =
    req.scope.resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
  res.json({
    template: await service.archive(req.params.id, input.version),
    revisions: await service.history(req.params.id),
    can_write: true,
  })
}
export async function getProduct(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, { action: "values.read", product_id: req.params.id })
  res.json(
    await productView(
      req.scope,
      req.params.id,
      await allowed(req, { action: "values.write", product_id: req.params.id })
    )
  )
}
export async function assignProductGroups(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, { action: "values.write", product_id: req.params.id })
  res.json(
    await mutateProductAttributes(
      req.scope,
      {
        product_id: req.params.id,
        assignment: parse(assignmentSchema, req.body),
      },
      true,
      req.auth_context.actor_id
    )
  )
}
export async function saveProductValues(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, { action: "values.write", product_id: req.params.id })
  res.json(
    await mutateProductAttributes(
      req.scope,
      {
        product_id: req.params.id,
        values: parse(valuesSchema, req.body),
      },
      true,
      req.auth_context.actor_id
    )
  )
}
export async function checkProduct(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, { action: "values.read", product_id: req.params.id })
  res.json({
    validation: await validateProduct(req.scope, req.params.id, true),
  })
}

export async function exportProductMetadata(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, { action: "values.read", product_id: req.params.id })
  await authorize(req, { action: "values.write", product_id: req.params.id })
  const input = parse(exportSchema, req.body)
  res.json(
    await exportProductAttributesMetadata(
      req.scope,
      req.params.id,
      input.version
    )
  )
}

export async function storeProduct(
  req: MedusaStoreRequest,
  res: MedusaResponse
) {
  const missing = () => {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Product attributes not found"
    )
  }
  const channels = req.publishable_key_context?.sales_channel_ids
  if (!channels?.length) return missing()
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: links } = await query.graph({
    entity: "product_sales_channel",
    fields: ["product_id"],
    filters: { product_id: req.params.id, sales_channel_id: channels },
  })
  if (!links.length) return missing()
  try {
    const state = await productState(req.scope, req.params.id)
    if (state.product.status !== "published" || !state.specification)
      return missing()
    const snapshot = {
      values: state.specification.values,
      variants: (state.product.variants || []).map((variant) => ({
        id: variant.id,
        values: state.specification!.variants[variant.id] || {},
      })),
    }
    if (
      productIssues(
        { fields: state.groups.flatMap((group) => group.fields) },
        snapshot,
        true
      ).length
    )
      return missing()
    const response: StoreProductAttributes = {
      product_id: state.product.id,
      groups: state.groups.map((group) => ({
        key: group.key,
        name: group.name,
        version: group.version,
        fields: group.fields,
      })),
      ...snapshot,
    }
    res.json(response)
  } catch (error) {
    if (
      error instanceof MedusaError &&
      [MedusaError.Types.NOT_FOUND, MedusaError.Types.INVALID_DATA].includes(
        error.type
      )
    )
      return missing()
    throw error
  }
}

export async function deleteTemplate(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, {
    action: "templates.write",
    template_id: req.params.id,
  })
  const input = parse(revisionSchema, req.body)
  res.json(
    await req.scope
      .resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
      .remove(req.params.id, input.version)
  )
}
