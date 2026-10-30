import { defineMiddlewares } from "@medusajs/framework/http"
import { protectNativeProductWrites } from "./native-guard"

export default defineMiddlewares({
  routes: [
    {
      matcher: /^\/admin\/(?:products|product-variants)(?:\/.*)?$/i,
      method: ["POST", "PUT", "PATCH"],
      middlewares: [protectNativeProductWrites],
    },
  ],
})
