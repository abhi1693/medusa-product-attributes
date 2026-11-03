import Medusa from "@medusajs/js-sdk"
import { createProductAttributesClient } from "../../client"

declare const __BACKEND_URL__: string | undefined
declare const __AUTH_TYPE__: "session" | "jwt" | undefined
declare const __JWT_TOKEN_STORAGE_KEY__: string | undefined

export const sdk = new Medusa({
  baseUrl:
    typeof __BACKEND_URL__ === "string"
      ? __BACKEND_URL__
      : window.location.origin,
  auth: {
    type: typeof __AUTH_TYPE__ === "string" ? __AUTH_TYPE__ : "session",
    jwtTokenStorageKey:
      typeof __JWT_TOKEN_STORAGE_KEY__ === "string"
        ? __JWT_TOKEN_STORAGE_KEY__
        : undefined,
  },
})

export const attributesApi = createProductAttributesClient(sdk.client)
export const attributesKeys = {
  templates: ["product-attributes", "templates"] as const,
  template: (id: string) => ["product-attributes", "templates", id] as const,
  product: (id: string) => ["product-attributes", "products", id] as const,
}
