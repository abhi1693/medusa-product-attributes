import { defineMiddlewares } from "@medusajs/framework/http"
import { validateNativeProductPublication } from "./native-guard"
import { protectPrivateSpecificationRelations } from "./private-relations"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin",
      middlewares: [protectPrivateSpecificationRelations],
    },
    {
      matcher: "/store",
      middlewares: [protectPrivateSpecificationRelations],
    },
    {
      matcher: /^\/admin\/products(?:\/.*)?$/i,
      method: ["POST", "PUT", "PATCH"],
      middlewares: [validateNativeProductPublication],
    },
  ],
})
