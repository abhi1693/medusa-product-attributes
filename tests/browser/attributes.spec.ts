import { readFileSync } from "node:fs"
import {
  expect,
  test,
  type Page,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test"
import type { AttributeField, StoreProductAttributes } from "../../src/types.js"

const fixture = JSON.parse(
  readFileSync(
    process.env.ATTRIBUTES_FIXTURE_PATH || "artifacts/fixtures.json",
    "utf8"
  )
) as {
  users: Record<string, { id: string; email: string; password: string }>
  product: { id: string; variants: Array<{ id: string }> }
  storefront: Array<{ channel_id: string; token: string }>
}
const route = "/app/settings/product-attributes"
const root = "/admin/product-attributes"
const login = async (page: Page, name = "administrator") => {
  await page.goto("/app/login")
  await page.getByPlaceholder("Email").fill(fixture.users[name].email)
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill(fixture.users[name].password)
  await page.getByRole("button", { name: /^continue with email$/i }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}
const tokenFor = async (request: APIRequestContext, name = "administrator") => {
  const { email, password } = fixture.users[name]
  const response = await request.post("/auth/user/emailpass", {
    data: { email, password },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return { Authorization: `Bearer ${(await response.json()).token}` }
}
const expectPrivateSpecificationDataAbsent = async (
  response: APIResponse,
  historyCanary: string
) => {
  expect([200, 400, 403], await response.text()).toContain(response.status())
  const body: unknown = await response.json()
  const privateKeys = new Set([
    "product_specification",
    "product_specification_link",
    "product_specification_variant",
    "product_specification_variant_link",
    "current_revision",
    "revisions",
    "actor_id",
  ])
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        expect(privateKeys.has(key), `Private JSON property: ${key}`).toBe(
          false
        )
        visit(child)
      }
    }
  }
  visit(body)
  expect(JSON.stringify(body)).not.toContain(historyCanary)
}

test("create and revise a template through native Admin controls", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await login(page)
  await page.goto(route)
  await expect(
    page.getByRole("heading", {
      name: "Attribute templates",
      exact: true,
    })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Create template", exact: true })
    .click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name", { exact: true }).fill("Device attributes")
  await dialog.getByLabel("Key", { exact: true }).fill("device_specifications")
  await dialog
    .getByLabel("Description", { exact: false })
    .fill("Typed hardware properties shared across a product range.")
  await dialog.getByLabel("Label", { exact: true }).fill("Model identifier")
  await dialog.getByLabel("Field key", { exact: true }).fill("model_identifier")
  await dialog.getByRole("checkbox", { name: "Required", exact: true }).check()
  await dialog
    .getByRole("checkbox", { name: "Comparable", exact: true })
    .check()
  await page.screenshot({
    path: "test-results/template-editor.png",
    fullPage: true,
  })
  await dialog.getByRole("button", { name: "Add field", exact: true }).click()
  const numberField = dialog.getByRole("group", { name: /^Field 2/ })
  await numberField.getByLabel("Label", { exact: true }).fill("Link capacity")
  await numberField
    .getByLabel("Field key", { exact: true })
    .fill("link_capacity")
  await numberField.getByLabel("Type", { exact: true }).click()
  await page.getByRole("option", { name: "Number", exact: true }).click()
  await numberField.getByLabel("Unit", { exact: true }).fill("Gbps")
  await numberField.getByLabel("Minimum", { exact: true }).fill("1")
  await numberField.getByLabel("Maximum", { exact: true }).fill("100")
  await numberField
    .getByRole("checkbox", { name: "Filterable", exact: true })
    .check()
  await numberField
    .getByRole("checkbox", { name: "Comparable", exact: true })
    .check()
  await numberField
    .getByLabel("Minimum", { exact: true })
    .scrollIntoViewIfNeeded()
  await page.screenshot({
    path: "test-results/template-editor-number.png",
    fullPage: true,
  })
  await dialog
    .getByRole("button", { name: "Create template", exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole("link", { name: /Device specifications/ }).click()
  await expect(
    page.getByRole("heading", { name: "Device attributes", exact: true })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Create version", exact: true })
    .click()
  await dialog
    .getByLabel("Description", { exact: false })
    .fill(
      "Shared model identifiers and connection capacity for network devices."
    )
  await dialog
    .getByRole("button", { name: "Create version", exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByText("device_specifications · Version 2", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Version 1 · Fields: 2", { exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: "test-results/template-detail.png",
    fullPage: true,
  })
  await page.goto("/app/products")
  await expect(
    page.getByRole("heading", { name: "Products", exact: true })
  ).toBeVisible()
  await page.goto("/app/settings/profile")
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true })
  ).toBeVisible()
  expect(errors).toEqual([])
})

test("typed values, stale writes and native publication preserve specification rules", async ({
  page,
  request,
}) => {
  const headers = await tokenFor(request)
  const named = await request.post(`/admin/products/${fixture.product.id}`, {
    headers,
    data: { title: "Network switch" },
  })
  expect(named.ok(), await named.text()).toBeTruthy()
  const created = await request.post(`${root}/templates`, {
    headers,
    data: {
      key: "network_equipment",
      name: "Network equipment",
      description:
        "Model, performance and connection options for networking products.",
      fields: [
        {
          key: "model_identifier",
          label: "Model identifier",
          type: "text",
          scope: "product",
          required: true,
          searchable: true,
          filterable: false,
          comparable: true,
        },
        {
          key: "capacity",
          label: "Capacity",
          type: "number",
          scope: "product",
          required: true,
          unit: "Gbps",
          min: 1,
          max: 100,
          searchable: true,
          filterable: true,
          comparable: true,
        },
        {
          key: "managed",
          label: "Managed",
          type: "boolean",
          scope: "product",
          required: false,
          searchable: false,
          filterable: true,
          comparable: true,
        },
        {
          key: "interfaces",
          label: "Interfaces",
          type: "multi_select",
          scope: "product",
          required: false,
          options: [
            { value: "ethernet", label: "Ethernet" },
            { value: "usb_c", label: "USB-C" },
            { value: "sfp_plus", label: "SFP+" },
          ],
          searchable: true,
          filterable: true,
          comparable: true,
        },
        {
          key: "finish",
          label: "Finish",
          type: "single_select",
          scope: "variant",
          required: true,
          options: [
            { value: "white", label: "White" },
            { value: "black", label: "Black" },
          ],
          searchable: false,
          filterable: true,
          comparable: true,
        },
      ],
    },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const { template } = await created.json()
  const state = await (
    await request.get(`${root}/products/${fixture.product.id}`, { headers })
  ).json()
  const assigned = await request.post(
    `${root}/products/${fixture.product.id}/groups`,
    {
      headers,
      data: {
        version: state.version,
        groups: [
          { template_id: template.id, template_version: template.version },
        ],
      },
    }
  )
  expect(assigned.ok(), await assigned.text()).toBeTruthy()
  const publish = await request.post(`/admin/products/${fixture.product.id}`, {
    headers,
    data: { status: "published" },
  })
  expect(publish.ok()).toBeFalsy()
  await login(page)
  await page.goto(`/app/products/${fixture.product.id}`)
  await expect(
    page.getByRole("heading", { name: "Product attributes", exact: true })
  ).toBeVisible()
  await page
    .getByRole("region", { name: "Product attributes", exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click()
  const editor = page.getByRole("dialog")
  await editor.getByLabel("Model identifier", { exact: true }).fill("NX-240")
  await editor.getByLabel("Capacity", { exact: true }).fill("24")
  await editor.getByLabel("Managed", { exact: true }).click()
  await page.getByRole("option", { name: "No", exact: true }).click()
  await editor.getByLabel("Interfaces", { exact: true }).click()
  await page.getByRole("option", { name: "Ethernet", exact: true }).click()
  await page.getByRole("option", { name: "SFP+", exact: true }).click()
  await editor.getByLabel("Model identifier", { exact: true }).click()
  await page.screenshot({
    path: "test-results/value-editor.png",
    fullPage: true,
  })
  await editor.getByRole("button", { name: "Save", exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(page.getByText("24 Gbps", { exact: true })).toBeVisible()
  const current = await (
    await request.get(`${root}/products/${fixture.product.id}`, { headers })
  ).json()
  const saved = await request.post(
    `${root}/products/${fixture.product.id}/values`,
    {
      headers,
      data: {
        version: current.version,
        values: {
          model_identifier: "NX-240",
          capacity: 24,
          managed: false,
          interfaces: ["ethernet", "sfp_plus"],
        },
        variants: current.variants.map(
          (variant: { id: string; version: string }) => ({
            id: variant.id,
            version: variant.version,
            values: { finish: "white" },
          })
        ),
      },
    }
  )
  expect(saved.ok(), await saved.text()).toBeTruthy()
  const stale = await request.post(
    `${root}/products/${fixture.product.id}/values`,
    {
      headers,
      data: { version: current.version, values: { capacity: 30 } },
    }
  )
  expect(stale.status()).toBe(409)
  const published = await request.post(
    `/admin/products/${fixture.product.id}`,
    { headers, data: { status: "published" } }
  )
  expect(published.ok(), await published.text()).toBeTruthy()
  const product = await (
    await request.get(`/admin/products/${fixture.product.id}`, { headers })
  ).json()
  expect(product.product.metadata.merchant_reference).toBe(
    "preserve-this-value"
  )
  await page.reload()
  await expect(page.getByText("24 Gbps", { exact: true })).toBeVisible()
  await expect(page.getByText("Ethernet, SFP+", { exact: true })).toBeVisible()
  await page.screenshot({
    path: "test-results/product-specifications.png",
    fullPage: true,
  })
  await page
    .getByRole("region", { name: "Product attributes", exact: true })
    .screenshot({
      path: "test-results/product-specifications-card.png",
    })
  await page.goto(
    `/app/products/${fixture.product.id}/variants/${fixture.product.variants[0].id}`
  )
  const variantRegion = page.getByRole("region", {
    name: "Variant attributes",
    exact: true,
  })
  await expect(variantRegion).toBeVisible()
  await variantRegion.getByRole("button", { name: "Edit", exact: true }).click()
  const variantEditor = page.getByRole("dialog")
  await variantEditor.getByLabel("Finish", { exact: true }).click()
  await page.getByRole("option", { name: "Black", exact: true }).click()
  await variantEditor.getByRole("button", { name: "Save", exact: true }).click()
  await expect(variantEditor).toHaveCount(0)
  await expect(variantRegion.getByText("Black", { exact: true })).toBeVisible()
  await page.screenshot({
    path: "test-results/variant-specifications.png",
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: "dark" })
  await page.reload()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await expect(variantRegion.getByText("Black", { exact: true })).toBeVisible()
  await page.screenshot({
    path: "test-results/specifications-mobile-dark.png",
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBeTruthy()
})

test("reader sees templates but cannot change them through the UI or API", async ({
  page,
  request,
}) => {
  const administrator = await tokenFor(request)
  const prepared = await request.post(`${root}/templates`, {
    headers: administrator,
    data: {
      key: "catalog_specifications",
      name: "Catalog attributes",
      fields: [
        {
          key: "model",
          label: "Model",
          type: "text",
          scope: "product",
          required: false,
          searchable: false,
          filterable: false,
          comparable: true,
        },
      ],
    },
  })
  expect(prepared.ok(), await prepared.text()).toBeTruthy()
  const headers = await tokenFor(request, "reader")
  const denied = await request.post(`${root}/templates`, { headers, data: {} })
  expect(denied.status()).toBe(403)
  await login(page, "reader")
  await page.goto(route)
  await expect(
    page.getByRole("heading", {
      name: "Attribute templates",
      exact: true,
    })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Create template", exact: true })
  ).toBeDisabled()
  await expect(page.getByText(/Read-only access/)).toBeVisible()
  await page.getByRole("link", { name: /Catalog specifications/ }).click()
  await expect(
    page.getByRole("button", { name: "Create version", exact: true })
  ).toBeDisabled()
})

test("Store attributes require a published product in the publishable key's channel", async ({
  request,
}) => {
  const headers = await tokenFor(request)
  const post = async (path: string, data: unknown) => {
    const response = await request.post(path, { headers, data })
    expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy()
    return response.json()
  }
  const { product } = await post("/admin/products", {
    title: "USB-C adapter",
    status: "draft",
    options: [
      { title: "Finish", values: ["Red", "Blue"] },
      { title: "Size", values: ["Small", "Large"] },
    ],
    variants: [
      {
        title: "Red / Small",
        sku: "ADAPTER-RED-S",
        manage_inventory: false,
        prices: [],
        options: { Finish: "Red", Size: "Small" },
      },
      {
        title: "Blue / Large",
        sku: "ADAPTER-BLUE-L",
        manage_inventory: false,
        prices: [],
        options: { Finish: "Blue", Size: "Large" },
      },
    ],
  })
  const redVariant = product.variants.find(
    (variant: { sku: string }) => variant.sku === "ADAPTER-RED-S"
  )
  const blueVariant = product.variants.find(
    (variant: { sku: string }) => variant.sku === "ADAPTER-BLUE-L"
  )
  expect(redVariant).toBeDefined()
  expect(blueVariant).toBeDefined()
  expect(redVariant.id).not.toBe(blueVariant.id)
  const fields: AttributeField[] = [
    {
      key: "model",
      label: "Model",
      type: "text",
      scope: "product",
      required: false,
      searchable: true,
      filterable: false,
      comparable: true,
    },
    {
      key: "standby_power_w",
      label: "Standby power",
      type: "number",
      scope: "product",
      required: true,
      unit: "W",
      min: 0,
      max: 100,
      searchable: false,
      filterable: true,
      comparable: true,
    },
    {
      key: "managed",
      label: "Managed",
      type: "boolean",
      scope: "product",
      required: true,
      searchable: false,
      filterable: true,
      comparable: false,
    },
    {
      key: "interfaces",
      label: "Interfaces",
      type: "multi_select",
      scope: "product",
      required: true,
      options: [
        { value: "usb_c", label: "USB-C" },
        { value: "ethernet", label: "Ethernet" },
        { value: "wifi", label: "Wi-Fi" },
      ],
      searchable: false,
      filterable: true,
      comparable: true,
    },
    {
      key: "finish",
      label: "Finish",
      type: "single_select",
      scope: "variant",
      required: true,
      options: [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
      ],
      searchable: false,
      filterable: true,
      comparable: true,
    },
    {
      key: "size",
      label: "Size",
      type: "single_select",
      scope: "variant",
      required: true,
      options: [
        { value: "s", label: "Small" },
        { value: "l", label: "Large" },
      ],
      searchable: false,
      filterable: true,
      comparable: true,
    },
  ]
  const { template } = await post(`${root}/templates`, {
    key: "adapter_specifications",
    name: "Adapter attributes",
    fields,
  })
  const state = await (
    await request.get(`${root}/products/${product.id}`, { headers })
  ).json()
  const assigned = await post(`${root}/products/${product.id}/groups`, {
    version: state.version,
    groups: [{ template_id: template.id, template_version: template.version }],
  })
  // This value exists only in immutable specification history. It is absent
  // from native commerce fields and every relation-probe request below.
  const historyCanary = `private_specification_history_${product.id}`
  const historical = await post(`${root}/products/${product.id}/values`, {
    version: assigned.version,
    values: { model: historyCanary },
  })
  await post(`${root}/products/${product.id}/values`, {
    version: historical.version,
    values: {
      model: "Reference adapter",
      standby_power_w: 0,
      managed: false,
      interfaces: ["usb_c", "ethernet"],
    },
    variants: [
      { id: redVariant.id, values: { finish: "red", size: "s" } },
      { id: blueVariant.id, values: { finish: "blue", size: "l" } },
    ].map((variant) => ({
      ...variant,
      version: historical.variants.find(
        (current: { id: string }) => current.id === variant.id
      ).version,
    })),
  })
  const [storefront, otherStorefront] = fixture.storefront
  await post(`/admin/sales-channels/${storefront.channel_id}/products`, {
    add: [product.id],
  })
  const path = `/store/products/${product.id}/attributes`
  const correct = { "x-publishable-api-key": storefront.token }
  const wrong = { "x-publishable-api-key": otherStorefront.token }
  expect((await request.get(path, { headers: correct })).status()).toBe(404)
  await post(`/admin/products/${product.id}`, { status: "published" })
  expect((await request.get(path, { headers: wrong })).status()).toBe(404)
  const visible = await request.get(path, { headers: correct })
  expect(visible.ok(), await visible.text()).toBeTruthy()
  const body = (await visible.json()) as StoreProductAttributes
  expect(body.product_id).toBe(product.id)
  expect(body.groups[0].key).toBe("adapter_specifications")
  expect(body.groups[0].version).toBe(template.version)
  expect(body.groups[0].fields).toEqual(fields)
  expect(
    [...new Set(body.groups[0].fields.map((field) => field.type))].sort()
  ).toEqual(["boolean", "multi_select", "number", "single_select", "text"])
  expect(body.values).toEqual({
    model: "Reference adapter",
    standby_power_w: 0,
    managed: false,
    interfaces: ["usb_c", "ethernet"],
  })
  // Distinct native variants retain their own conjunctions; this contract
  // deliberately does not flatten red/small and blue/large into red/large.
  expect(body.variants).toHaveLength(2)
  expect(body.variants).toEqual(
    expect.arrayContaining([
      { id: redVariant.id, values: { finish: "red", size: "s" } },
      { id: blueVariant.id, values: { finish: "blue", size: "l" } },
    ])
  )
  expect(JSON.stringify(body)).not.toContain(historyCanary)
  expect((await request.get(path)).ok()).toBeFalsy()

  const productFields = [
    "id",
    "title",
    "product_specification.current_revision.values",
    "product_specification.current_revision.actor_id",
    "product_specification.revisions.values",
    "product_specification.revisions.actor_id",
    "variants.product_specification_variant.specification.revisions.values",
    "variants.product_specification_variant.specification.current_revision.actor_id",
    "product_specification_link.*",
  ].join(",")
  const variantFields = [
    "id",
    "sku",
    "product_specification_variant.specification.current_revision.values",
    "product_specification_variant.specification.revisions.actor_id",
    "product_specification_variant_link.*",
    "product.product_specification.revisions.values",
  ].join(",")
  const probes: Array<{
    path: string
    headers: Record<string, string>
    params: Record<string, string>
  }> = [
    {
      path: `/admin/products/${product.id}`,
      headers,
      params: { fields: productFields },
    },
    {
      path: "/admin/products",
      headers,
      params: { id: product.id, fields: productFields },
    },
    {
      path: `/admin/products/${product.id}/variants`,
      headers,
      params: { fields: variantFields },
    },
    {
      path: `/admin/products/${product.id}/variants/${product.variants[0].id}`,
      headers,
      params: { fields: variantFields },
    },
    {
      path: `/store/products/${product.id}`,
      headers: correct,
      params: { fields: productFields },
    },
    {
      path: "/store/products",
      headers: correct,
      params: { id: product.id, fields: productFields },
    },
  ]
  for (const probe of probes) {
    await test.step(`Native relation privacy: ${probe.path}`, async () => {
      const response = await request.get(probe.path, {
        headers: probe.headers,
        params: probe.params,
      })
      // Native validators may strip a denied projection or reject the query.
      // Inspect property names recursively; an error can echo requested paths.
      await expectPrivateSpecificationDataAbsent(response, historyCanary)
    })
  }
})

test("template impact lists products pinned to earlier schema versions", async ({
  page,
  request,
}) => {
  const headers = await tokenFor(request)
  const post = async (path: string, data: unknown) => {
    const response = await request.post(path, { headers, data })
    expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy()
    return response.json()
  }
  const { product } = await post("/admin/products", {
    title: "Compact network adapter",
    status: "draft",
    options: [{ title: "Configuration", values: ["Default"] }],
    variants: [
      {
        title: "Default",
        manage_inventory: false,
        prices: [],
        options: { Configuration: "Default" },
      },
    ],
  })
  const definition = {
    key: "accessory_specifications",
    name: "Accessory attributes",
    fields: [
      {
        key: "model",
        label: "Model",
        type: "text",
        scope: "product",
        required: false,
        searchable: false,
        filterable: false,
        comparable: true,
      },
    ],
  }
  const { template } = await post(`${root}/templates`, definition)
  const state = await (
    await request.get(`${root}/products/${product.id}`, { headers })
  ).json()
  await post(`${root}/products/${product.id}/groups`, {
    version: state.version,
    groups: [{ template_id: template.id, template_version: 1 }],
  })
  await post(`${root}/templates/${template.id}`, {
    ...definition,
    version: 1,
    description: "Shared model identifiers for compact network accessories.",
  })
  await login(page)
  await page.goto(`${route}/${template.id}`)
  const region = page.getByRole("region", {
    name: "Assigned products",
    exact: true,
  })
  await expect(
    region.getByRole("link", { name: /Compact network adapter/ })
  ).toBeVisible()
  await expect(region.getByText("Version 1", { exact: true })).toBeVisible()
  await expect(region.getByText("Version 2", { exact: true })).toBeVisible()
  await region
    .getByRole("checkbox", { name: "Earlier versions only", exact: true })
    .check()
  await expect(
    region.getByText("Update available", { exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: "test-results/template-impact.png",
    fullPage: true,
  })
  await region.screenshot({ path: "test-results/template-impact-card.png" })
  await page.goto(route)
  await expect(
    page.getByRole("link", { name: /Accessory specifications/ })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: /Network equipment/ })
  ).toBeVisible()
  await page.screenshot({
    path: "test-results/template-list.png",
    fullPage: true,
  })
})

test("several reusable groups edit and reload on native products with clear optional values", async ({
  page,
  request,
}) => {
  const headers = await tokenFor(request)
  const post = async (path: string, data: Record<string, unknown>) => {
    const response = await request.post(path, { headers, data })
    expect(response.ok(), await response.text()).toBeTruthy()
    return response.json()
  }
  const number = (
    key: string,
    label: string,
    unit?: string
  ): AttributeField => ({
    key,
    label,
    type: "number",
    scope: "product",
    required: false,
    searchable: false,
    filterable: false,
    comparable: true,
    ...(unit ? { unit } : {}),
  })
  const { template: power } = await post(root + "/templates", {
    key: "shared_power",
    name: "Power",
    fields: [number("max_power_w", "Maximum power", "W")],
  })
  const { template: connectivity } = await post(root + "/templates", {
    key: "shared_connectivity",
    name: "Connectivity",
    fields: [number("port_count", "Port count")],
  })
  const { template: software } = await post(root + "/templates", {
    key: "shared_software",
    name: "Software",
    fields: [{ ...number("managed", "Managed"), type: "boolean" }],
  })
  const products = []
  for (const handle of ["grouped-device-one", "grouped-device-two"]) {
    const { product } = await post("/admin/products", {
      title: handle,
      handle,
      status: "draft",
      weight: 338,
      options: [{ title: "Configuration", values: ["Default"] }],
      variants: [
        {
          title: "Default",
          sku: handle,
          options: { Configuration: "Default" },
          prices: [],
        },
      ],
    })
    products.push(product)
    const state = await (
      await request.get(root + "/products/" + product.id, { headers })
    ).json()
    const assigned = await post(root + "/products/" + product.id + "/groups", {
      version: state.version,
      groups: [connectivity, power, software].map((group) => ({
        template_id: group.id,
        template_version: group.version,
      })),
    })
    expect(assigned.groups.map((group: { id: string }) => group.id)).toEqual([
      connectivity.id,
      power.id,
      software.id,
    ])
  }
  const duplicateState = await (
    await request.get(root + "/products/" + products[0].id, { headers })
  ).json()
  const duplicate = await request.post(
    root + "/products/" + products[0].id + "/groups",
    {
      headers,
      data: {
        version: duplicateState.version,
        groups: [power, power].map((group) => ({
          template_id: group.id,
          template_version: group.version,
        })),
      },
    }
  )
  expect(duplicate.status()).toBe(400)
  await login(page)
  await page.goto("/app/products/" + products[0].id)
  const region = page.getByRole("region", {
    name: "Product attributes",
    exact: true,
  })
  await expect(
    region.getByRole("heading", { name: "Power", exact: true })
  ).toBeVisible()
  await expect(
    region.getByRole("heading", { name: "Software", exact: true })
  ).toBeVisible()
  await region.getByRole("button", { name: "Edit", exact: true }).click()
  const editor = page.getByRole("dialog")
  await editor.getByLabel("Maximum power", { exact: true }).fill("9")
  await editor.getByLabel("Port count", { exact: true }).fill("0")
  await editor.getByLabel("Managed", { exact: true }).click()
  await page.getByRole("option", { name: "No", exact: true }).click()
  await page.screenshot({
    path: "test-results/multiple-groups-editor.png",
    fullPage: true,
  })
  await editor.getByRole("button", { name: "Save", exact: true }).click()
  await expect(editor).toHaveCount(0)
  await page.reload()
  await expect(region.getByText("9 W", { exact: true })).toBeVisible()
  await expect(region.getByText("No", { exact: true })).toBeVisible()
  await region.getByRole("button", { name: "Edit", exact: true }).click()
  await page
    .getByRole("dialog")
    .getByLabel("Maximum power", { exact: true })
    .fill("")
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click()
  await page.reload()
  await expect(region.getByText("Not set", { exact: true })).toHaveCount(1)
  const other = await (
    await request.get(root + "/products/" + products[1].id, { headers })
  ).json()
  expect(other.values).toEqual({})
  expect(other.groups.map((group: { id: string }) => group.id)).toContain(
    power.id
  )
})
