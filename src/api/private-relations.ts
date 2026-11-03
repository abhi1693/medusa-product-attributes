import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

const privateRelations = [
  "product_specification",
  "product_specification_link",
  "product_specification_variant",
  "product_specification_variant_link",
]

// Native Admin field queries are open to linked relations by default. Route
// handlers authorize the normalized API; raw HTTP graph traversal stays private.
// Trusted server-side Query calls remain available to consuming applications.
export function protectPrivateSpecificationRelations(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  req.disallowed = [
    ...new Set([...(req.disallowed ?? []), ...privateRelations]),
  ]
  next()
}
