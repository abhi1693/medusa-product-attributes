import { randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"
import type {
  ExecArgs,
  IAuthModuleService,
  IUserModuleService,
  IApiKeyModuleService,
  ISalesChannelModuleService,
} from "@medusajs/framework/types"
import { ApiKeyType, Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { ACCESS_CONTROL } from "@abhi1693/medusa-rbac/modules/access-control"
import type AccessControlService from "@abhi1693/medusa-rbac/service"

export default async function seed({ container }: ExecArgs) {
  const connection = new URL(process.env.DATABASE_URL || "")
  if (
    process.env.CI !== "true" ||
    !["127.0.0.1", "localhost"].includes(connection.hostname) ||
    !/^\/attributes_[a-z0-9_]+_test$/.test(connection.pathname)
  ) {
    throw new Error("Fixture seeding requires a disposable local CI database")
  }
  const users = container.resolve<IUserModuleService>(Modules.USER)
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
  const access = container.resolve<AccessControlService>(ACCESS_CONTROL)
  if ((await users.listUsers({})).length) {
    throw new Error("Fixture seeding requires an empty database")
  }
  const credentials: Record<
    string,
    { id: string; email: string; password: string }
  > = {}
  for (const name of ["administrator", "reader", "editor", "values_editor"]) {
    const email = `attributes-${name}@example.test`
    const password = randomBytes(24).toString("base64url")
    const user = await users.createUsers({ email, first_name: name })
    const { authIdentity, error } = await auth.register("emailpass", {
      body: { email, password },
    })
    if (!authIdentity || error) throw new Error(error || "Identity not created")
    await auth.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: { user_id: user.id },
    })
    credentials[name] = { id: user.id, email, password }
  }
  await access.bootstrap(credentials.administrator.id)
  for (const name of ["reader", "editor", "values_editor"]) {
    const { result } = await access.mutate(credentials.administrator.id, {
      kind: "create_role",
      name: `Fixture ${name}`,
      permissions: [
        "products.view",
        ...(name === "values_editor"
          ? []
          : ["product_attributes.templates_read"]),
        "product_attributes.values_read",
        ...(name !== "reader" ? ["product_attributes.values_write"] : []),
      ],
    })
    await access.mutate(credentials.administrator.id, {
      kind: "set_staff",
      user_id: credentials[name].id,
      role_ids: [(result as { id: string }).id],
      active: true,
      version: 0,
    })
  }
  const { result } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Example product",
          status: "draft",
          metadata: { merchant_reference: "preserve-this-value" },
          options: [{ title: "Configuration", values: ["Standard", "Plus"] }],
          variants: ["Standard", "Plus"].map((title) => ({
            title,
            sku: `ATTRIBUTES-TEST-${title.toUpperCase()}`,
            manage_inventory: false,
            options: { Configuration: title },
            metadata: { merchant_reference: `preserve-${title}` },
          })),
        },
      ],
    },
  })
  const channels = await container
    .resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL)
    .createSalesChannels([
      { name: "Attributes public fixture channel" },
      { name: "Other attributes fixture channel" },
    ])
  const keys = container.resolve<IApiKeyModuleService>(Modules.API_KEY)
  const storefront = []
  for (const channel of channels) {
    const key = await keys.createApiKeys({
      title: channel.name,
      type: ApiKeyType.PUBLISHABLE,
      created_by: credentials.administrator.id,
    })
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: key.id, add: [channel.id] },
    })
    storefront.push({ channel_id: channel.id, token: key.token })
  }
  writeFileSync(
    process.env.ATTRIBUTES_FIXTURE_PATH || "/plugin/artifacts/fixtures.json",
    JSON.stringify({ users: credentials, product: result[0], storefront }),
    { mode: 0o600 }
  )
  console.info("Created isolated browser fixtures; credentials saved locally")
}
