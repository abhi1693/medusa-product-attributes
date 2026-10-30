import { readFileSync } from "node:fs"
import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test"

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

test("create and revise a template through native Admin controls", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await login(page)
  await page.goto(route)
  await expect(
    page.getByRole("heading", { name: "Product attributes", exact: true })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Create template", exact: true })
    .click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name", { exact: true }).fill("Browser specification")
  await dialog.getByLabel("Key", { exact: true }).fill("browser_specification")
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
  await dialog
    .getByRole("button", { name: "Create template", exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole("link", { name: /Browser specification/ }).click()
  await expect(
    page.getByRole("heading", { name: "Browser specification", exact: true })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Create version", exact: true })
    .click()
  await dialog
    .getByLabel("Description", { exact: false })
    .fill("Revised description")
  await dialog
    .getByRole("button", { name: "Create version", exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByText("browser_specification · Version 2", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Version 1 · Fields: 1", { exact: true })
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
  const created = await request.post(`${root}/templates`, {
    headers,
    data: {
      key: "typed_browser",
      name: "Typed specifications",
      fields: [
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
    `${root}/products/${fixture.product.id}/assignment`,
    {
      headers,
      data: {
        version: state.version,
        template_id: template.id,
        template_version: template.version,
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
    page.getByRole("heading", { name: "Specifications", exact: true })
  ).toBeVisible()
  await page
    .getByRole("region", { name: "Specifications", exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click()
  const editor = page.getByRole("dialog")
  await editor.getByLabel("Capacity", { exact: true }).fill("24")
  await editor.getByLabel("Managed", { exact: true }).click()
  await page.getByRole("option", { name: "No", exact: true }).click()
  await page.screenshot({
    path: "test-results/value-editor.png",
    fullPage: true,
  })
  await editor.getByRole("button", { name: "Save", exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(page.getByText("24 Gbps", { exact: true })).toBeVisible()
  await page.screenshot({
    path: "test-results/product-specifications.png",
    fullPage: true,
  })
  const current = await (
    await request.get(`${root}/products/${fixture.product.id}`, { headers })
  ).json()
  const saved = await request.post(
    `${root}/products/${fixture.product.id}/values`,
    {
      headers,
      data: {
        version: current.version,
        values: { capacity: 24, managed: false },
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
  await page.goto(
    `/app/products/${fixture.product.id}/variants/${fixture.product.variants[0].id}`
  )
  const variantRegion = page.getByRole("region", {
    name: "Variant specifications",
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
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => document.documentElement.classList.add("dark"))
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
      key: "reader_fixture",
      name: "Reader specifications",
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
    page.getByRole("heading", { name: "Product attributes", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Create template", exact: true })
  ).toBeDisabled()
  await expect(page.getByText(/Read-only access/)).toBeVisible()
  await page.getByRole("link", { name: /Reader specifications/ }).click()
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
    title: "Store contract fixture",
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
  const { template } = await post(`${root}/templates`, {
    key: "store_contract",
    name: "Public specifications",
    fields: [
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
    ],
  })
  const state = await (
    await request.get(`${root}/products/${product.id}`, { headers })
  ).json()
  await post(`${root}/products/${product.id}/assignment`, {
    version: state.version,
    template_id: template.id,
    template_version: template.version,
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
  const body = await visible.json()
  expect(body.product_id).toBe(product.id)
  expect(body.template.key).toBe("store_contract")
  expect(body.template.fields[0].comparable).toBe(true)
  expect((await request.get(path)).ok()).toBeFalsy()
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
    title: "Template impact fixture",
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
    key: "impact_fixture",
    name: "Impact specifications",
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
  await post(`${root}/products/${product.id}/assignment`, {
    version: state.version,
    template_id: template.id,
    template_version: 1,
  })
  await post(`${root}/templates/${template.id}`, {
    ...definition,
    version: 1,
    description: "New immutable version",
  })
  await login(page)
  await page.goto(`${route}/${template.id}`)
  const region = page.getByRole("region", {
    name: "Assigned products",
    exact: true,
  })
  await expect(
    region.getByRole("link", { name: /Template impact fixture/ })
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
})
