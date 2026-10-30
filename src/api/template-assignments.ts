import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { PRODUCT_ATTRIBUTES } from "../constants"
import type ProductAttributesService from "../modules/product-attributes/service"
import type { TemplateAssignmentsResponse } from "../template-assignments"
import { allowed, authorize } from "./authorization"

const page = z
  .object({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    outdated: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .strict()

export async function templateAssignments(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await authorize(req, {
    action: "templates.read",
    template_id: req.params.id,
  })
  const parsed = page.safeParse(req.query)
  if (!parsed.success)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid template assignment pagination or filter"
    )
  const { offset, limit, outdated } = parsed.data
  const service =
    req.scope.resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
  const template = await service.revision(req.params.id)
  const [specifications, count] =
    await service.listAndCountProductSpecifications(
      {
        template_id: template.id,
        linked: true,
        ...(outdated ? { template_version: { $lt: template.version } } : {}),
      },
      {
        skip: offset,
        take: limit,
        order: { id: "ASC" },
        select: ["id", "product_id", "template_version"],
      }
    )
  const visible = [] as typeof specifications
  for (const specification of specifications)
    if (
      await allowed(req, {
        action: "values.read",
        product_id: specification.product_id,
        template_id: template.id,
      })
    )
      visible.push(specification)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const products = visible.length
    ? (
        await query.graph({
          entity: "product",
          fields: ["id", "title", "status"],
          filters: {
            id: visible.map((specification) => specification.product_id),
          },
        })
      ).data
    : []
  const byId = new Map<string, { id: string; title: string; status: string }>(
    products.map((product: { id: string; title: string; status: string }) => [
      product.id,
      product,
    ])
  )
  const response: TemplateAssignmentsResponse = {
    assignments: visible.flatMap((specification) => {
      const product = byId.get(specification.product_id)
      return product
        ? [
            {
              product: {
                id: product.id,
                title: product.title,
                status: product.status,
              },
              template_version: specification.template_version,
            },
          ]
        : []
    }),
    current_version: template.version,
    count,
    offset,
    limit,
  }
  res.json(response)
}
