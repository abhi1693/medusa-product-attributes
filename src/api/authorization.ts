import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { PRODUCT_ATTRIBUTES } from "../constants"
import type ProductAttributesService from "../modules/product-attributes/service"
import type { AuthorizationContext } from "../types"

export async function allowed(
  request: AuthenticatedMedusaRequest,
  context: AuthorizationContext
) {
  if (
    !request.auth_context?.actor_id ||
    request.auth_context.actor_type !== "user"
  )
    return false
  const service =
    request.scope.resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
  return service.configuration.authorize
    ? service.configuration.authorize(request, context)
    : true
}

export async function authorize(
  request: AuthenticatedMedusaRequest,
  context: AuthorizationContext
) {
  if (!request.auth_context?.actor_id)
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Sign in to Medusa Admin"
    )
  if (!(await allowed(request, context)))
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "You cannot perform this attribute operation"
    )
}
