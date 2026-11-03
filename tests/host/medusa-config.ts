import { defineConfig } from "@medusajs/framework/utils"
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { ACCESS_CONTROL } from "@abhi1693/medusa-rbac/modules/access-control"
import type AccessControlService from "@abhi1693/medusa-rbac/service"
import type { ProductAttributesOptions } from "@abhi1693/medusa-product-attributes/types"
import type { AccessControlOptions } from "@abhi1693/medusa-rbac/config"
import { commandProfile, defineResource } from "@abhi1693/medusa-rbac/resources"

const actions = [
  "templates.read",
  "templates.write",
  "values.read",
  "values.write",
] as const
const permission = (action: string) =>
  `product_attributes.${action.replace(".", "_")}`
const access: AccessControlOptions = {
  permissions: actions.map((action) => [
    permission(action),
    `${action.split(".")[1]} ${action.split(".")[0]}`,
    "Product attributes",
  ]),
  resources: [
    defineResource({
      key: "product-attributes",
      root: "product-attributes",
      actorTypes: ["user"],
      operations: {
        templates_read: { permissions: [permission("templates.read")] },
        templates_write: { permissions: [permission("templates.write")] },
        values_read: { permissions: [permission("values.read")] },
        values_write: { permissions: [permission("values.write")] },
        values_export: {
          permissions: [permission("values.read"), permission("values.write")],
        },
      },
      profile: {
        children: {
          templates: {
            actions: { GET: "templates_read", POST: "templates_write" },
            item: {
              parameter: "id",
              profile: {
                actions: { GET: "templates_read", POST: "templates_write" },
                children: {
                  archive: commandProfile("templates_write"),
                  products: commandProfile("templates_read", "GET"),
                },
              },
            },
          },
          products: {
            item: {
              parameter: "id",
              profile: {
                actions: { GET: "values_read" },
                children: {
                  groups: commandProfile("values_write"),
                  values: commandProfile("values_write"),
                  validate: commandProfile("values_read"),
                  export: commandProfile("values_export"),
                },
              },
            },
          },
        },
      },
    }),
  ],
}
const attributes: ProductAttributesOptions = {
  authorize: async (request, context) => {
    const req = request as AuthenticatedMedusaRequest
    const actor = req.auth_context
    if (!actor || actor.actor_type !== "user") return false
    const service = req.scope.resolve<AccessControlService>(ACCESS_CONTROL)
    const principal = await service.actorPrincipal({
      type: "user",
      id: actor.actor_id,
    })
    return service.allows(principal, permission(context.action))
  },
}

module.exports = defineConfig({
  featureFlags: { rbac: false, rbac_filter_fields: false },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
      adminCors: "http://localhost:19001,http://127.0.0.1:19001",
      authCors: "http://localhost:19001,http://127.0.0.1:19001",
      storeCors: "http://localhost:19001,http://127.0.0.1:19001",
    },
  },
  admin: {
    vite: () => ({
      server: {
        host: "0.0.0.0",
        allowedHosts: ["localhost", "127.0.0.1"],
        hmr: {
          port: Number(process.env.ATTRIBUTES_HMR_PORT || "5173"),
        },
      },
    }),
  },
  plugins: [
    { resolve: "@abhi1693/medusa-rbac", options: access },
    { resolve: "@zanreal/medusa-admin-kit", options: {} },
    { resolve: "@abhi1693/medusa-product-attributes", options: attributes },
  ],
})
