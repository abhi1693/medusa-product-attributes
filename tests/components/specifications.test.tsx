import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, expect, test, vi } from "vitest"
import type {
  AdminProduct,
  AdminProductVariant,
} from "@medusajs/framework/types"
import type { ProductAttributes } from "../../src/types"

const mocks = vi.hoisted(() => ({
  product: vi.fn(),
  saveValues: vi.fn(),
  assignTemplate: vi.fn(),
  prompt: vi.fn(),
}))
vi.mock("../../src/admin/lib/api", () => ({
  attributesApi: mocks,
  attributesKeys: { product: (id: string) => ["attributes", "products", id] },
}))
vi.mock("@medusajs/ui", async (original) => ({
  ...(await original<typeof import("@medusajs/ui")>()),
  usePrompt: () => mocks.prompt,
}))
import { Specifications } from "../../src/admin/components/specifications"
import ProductWidget, {
  config as productConfig,
} from "../../src/admin/widgets/product-specifications"
import VariantWidget, {
  config as variantConfig,
} from "../../src/admin/widgets/variant-specifications"

const view: ProductAttributes = {
  product_id: "product",
  assignment_version: 1,
  version: "product_v1",
  can_write: true,
  template: {
    id: "template",
    key: "switch",
    name: "Switch",
    version: 1,
    source: "admin",
    archived: false,
    category_ids: [],
    description: "",
    fields: [
      {
        key: "ports",
        label: "Ports",
        type: "number",
        unit: "ports",
        scope: "product",
        required: true,
        searchable: false,
        filterable: false,
        comparable: true,
      },
      {
        key: "colour",
        label: "Colour",
        type: "text",
        scope: "variant",
        required: false,
        searchable: false,
        filterable: false,
        comparable: true,
      },
    ],
  },
  values: { ports: 0 },
  variants: [
    {
      id: "variant",
      title: "PoE",
      version: "variant_v1",
      values: { colour: "White" },
    },
  ],
  validation: [],
  templates: [
    {
      id: "template",
      key: "switch",
      name: "Switch",
      version: 2,
      source: "admin",
      archived: false,
    },
  ],
}
const mount = (variantId?: string) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Specifications productId="product" variantId={variantId} />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.product.mockResolvedValue(structuredClone(view))
  mocks.saveValues.mockResolvedValue({
    ...view,
    version: "product_v2",
    values: { ports: 24 },
  })
  mocks.assignTemplate.mockResolvedValue({
    ...view,
    version: "product_v2",
    template: { ...view.template!, version: 2 },
  })
  mocks.prompt.mockResolvedValue(true)
})

test("product specifications preserve typed values and save through a focused native drawer", async () => {
  const user = userEvent.setup()
  mount()
  expect(
    await screen.findByRole("region", { name: "Specifications" })
  ).toHaveTextContent("0 ports")
  await user.click(screen.getByRole("button", { name: "Edit" }))
  const dialog = await screen.findByRole("dialog")
  fireEvent.change(within(dialog).getByLabelText("Ports"), {
    target: { value: "24" },
  })
  await user.click(within(dialog).getByRole("button", { name: "Save" }))
  await waitFor(() =>
    expect(mocks.saveValues).toHaveBeenCalledWith("product", {
      version: "product_v1",
      values: { ports: 24 },
    })
  )
  expect(await screen.findByText("24 ports")).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  )
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus()
  )
})

test("variant editor updates only the selected variant and preserves product scope", async () => {
  const user = userEvent.setup()
  mocks.saveValues.mockResolvedValue({
    ...view,
    variants: [{ ...view.variants[0], values: { colour: "Black" } }],
  })
  mount("variant")
  expect(
    await screen.findByRole("region", { name: "Variant specifications" })
  ).toHaveTextContent("White")
  expect(
    screen.queryByRole("button", { name: "Change template" })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Edit" }))
  await user.clear(screen.getByLabelText("Colour"))
  await user.type(screen.getByLabelText("Colour"), "Black")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() =>
    expect(mocks.saveValues).toHaveBeenCalledWith("product", {
      version: "product_v1",
      variants: [
        { id: "variant", version: "variant_v1", values: { colour: "Black" } },
      ],
    })
  )
  expect(await screen.findByText("Black")).toBeInTheDocument()
})

test("template assignment is explicit and uses an immutable version", async () => {
  const user = userEvent.setup()
  mocks.product.mockResolvedValue({ ...view, template: null, values: {} })
  mount()
  expect(
    await screen.findByText("No specification template")
  ).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Assign template" }))
  expect(screen.getByRole("button", { name: "Apply template" })).toBeDisabled()
  await user.click(
    screen.getByRole("combobox", { name: "Specification template" })
  )
  await user.click(screen.getByRole("option", { name: "Switch · v2" }))
  await user.click(screen.getByRole("button", { name: "Apply template" }))
  await waitFor(() =>
    expect(mocks.assignTemplate).toHaveBeenCalledWith("product", {
      version: "product_v1",
      template_id: "template",
      template_version: 2,
    })
  )
  expect(mocks.prompt).not.toHaveBeenCalled()
})

test("category recommendations come from the server and leave other templates available for explicit assignment", async () => {
  const user = userEvent.setup()
  mocks.product.mockResolvedValue({
    ...view,
    template: null,
    values: {},
    templates: [
      { ...view.templates[0], recommended: true, category_ids: [] },
      {
        ...view.templates[0],
        id: "alternative",
        name: "General device",
        version: 1,
        recommended: false,
        category_ids: ["cat_other"],
      },
    ],
  })
  mount()
  await user.click(
    await screen.findByRole("button", { name: "Assign template" })
  )
  expect(
    screen.getByText(/Recommended templates match this product/)
  ).toBeInTheDocument()
  expect(mocks.assignTemplate).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole("combobox", { name: "Specification template" })
  )
  expect(
    screen.getByRole("option", { name: "Switch · v2 · Recommended" })
  ).toBeInTheDocument()
  await user.click(screen.getByRole("option", { name: "General device · v1" }))
  expect(mocks.assignTemplate).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "Apply template" }))
  await waitFor(() =>
    expect(mocks.assignTemplate).toHaveBeenCalledWith("product", {
      version: "product_v1",
      template_id: "alternative",
      template_version: 1,
    })
  )
})

test("adopting a new version requires confirmation and stale assignment errors support refresh", async () => {
  const user = userEvent.setup()
  mount()
  const adopt = await screen.findByRole("button", {
    name: "Adopt latest version",
  })
  mocks.prompt.mockResolvedValueOnce(false)
  await user.click(adopt)
  expect(mocks.assignTemplate).not.toHaveBeenCalled()
  mocks.assignTemplate.mockRejectedValueOnce({ status: 409 })
  await user.click(adopt)
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your edits are preserved"
  )
  await user.click(screen.getByRole("button", { name: "Reload" }))
  await waitFor(() => expect(mocks.product).toHaveBeenCalledTimes(2))
  await user.click(adopt)
  await waitFor(() =>
    expect(mocks.assignTemplate).toHaveBeenLastCalledWith("product", {
      version: "product_v1",
      template_id: "template",
      template_version: 2,
    })
  )
  expect(await screen.findByText("Switch · Version 2")).toBeInTheDocument()
})

test("stale value writes preserve edits, block blind resubmission and offer confirmed reload", async () => {
  const user = userEvent.setup()
  mocks.saveValues.mockRejectedValueOnce({ status: 409 })
  mount()
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  fireEvent.change(screen.getByLabelText("Ports"), { target: { value: "12" } })
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your edits are preserved"
  )
  expect(screen.getByLabelText("Ports")).toHaveValue(12)
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  mocks.prompt.mockResolvedValueOnce(false)
  await user.click(screen.getByRole("button", { name: "Reload latest" }))
  expect(screen.getByLabelText("Ports")).toHaveValue(12)
  mocks.product.mockRejectedValueOnce(new Error("Reload unavailable"))
  await user.click(screen.getByRole("button", { name: "Reload latest" }))
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Reload unavailable"
  )
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Reload latest" })).toHaveFocus()
  )
  expect(screen.getByLabelText("Ports")).toHaveValue(12)
  mocks.product.mockResolvedValueOnce({
    ...view,
    version: "newer",
    values: { ports: 48 },
  })
  await user.click(screen.getByRole("button", { name: "Reload latest" }))
  expect(await screen.findByText("48 ports")).toBeInTheDocument()
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

test("ordinary save errors and dirty cancellation retain values until confirmed", async () => {
  const user = userEvent.setup()
  mocks.saveValues.mockRejectedValueOnce(new Error("Request failed"))
  mount()
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Edit" }))
  fireEvent.change(screen.getByLabelText("Ports"), { target: { value: "1" } })
  mocks.prompt.mockResolvedValueOnce(false)
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(screen.getByRole("dialog")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Request failed")
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  )
})

test("read-only, incomplete, no-scope and unavailable-variant states are clear", async () => {
  mocks.product.mockResolvedValue({
    ...view,
    can_write: false,
    validation: [
      { path: "ports", code: "required", message: "Ports is required" },
    ],
  })
  const { unmount } = mount()
  expect(await screen.findByText("Ports is required")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled()
  expect(screen.getByText("You have read-only access.")).toBeInTheDocument()
  unmount()
  mocks.product.mockResolvedValue({
    ...view,
    template: { ...view.template!, fields: [] },
  })
  const next = mount()
  expect(await screen.findByText("No product fields")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Edit" }))
  expect(
    await screen.findByText("This template has no product fields.")
  ).toBeInTheDocument()
  next.unmount()
  const missing = mount("missing")
  expect(
    await screen.findByText("Variant specifications unavailable")
  ).toBeInTheDocument()
  missing.unmount()
  mocks.product.mockResolvedValue({
    ...view,
    template: { ...view.template!, fields: [] },
  })
  const variant = mount("variant")
  expect(await screen.findByText("No variant fields")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Edit" }))
  expect(
    await screen.findByText("This template has no variant fields.")
  ).toBeInTheDocument()
  variant.unmount()
})

test("unassigned variants explain product-level assignment and empty pickers remain actionable", async () => {
  mocks.product.mockResolvedValue({ ...view, template: null, templates: [] })
  const { unmount } = mount("variant")
  expect(
    await screen.findByText(/Assign a specification template on the product/)
  ).toBeInTheDocument()
  unmount()
  mount()
  await userEvent.click(
    await screen.findByRole("button", { name: "Assign template" })
  )
  expect(
    screen.getByText(/No active templates are available/)
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Assign template" }))
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
})

test("loading, failed reads and permission denial recover without breaking native pages", async () => {
  mocks.product.mockImplementationOnce(() => new Promise(() => {}))
  const { unmount } = mount()
  expect(screen.getByText("Loading specifications…")).toBeInTheDocument()
  unmount()
  mocks.product.mockRejectedValueOnce({ status: 403 })
  mount()
  expect(await screen.findByRole("alert")).toHaveTextContent("permission")
  await userEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(await screen.findByText("0 ports")).toBeInTheDocument()
})

test("pending value submission prevents close and duplicate saves", async () => {
  const user = userEvent.setup()
  let complete!: (value: ProductAttributes) => void
  mocks.saveValues.mockImplementationOnce(
    () =>
      new Promise<ProductAttributes>((resolve) => {
        complete = resolve
      })
  )
  mount()
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  expect(screen.getByLabelText("Ports")).toBeDisabled()
  await user.keyboard("{Escape}")
  expect(screen.getByRole("dialog")).toBeInTheDocument()
  complete(view)
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  )
})

test("pending template assignment prevents opening an editor with an outdated schema", async () => {
  let complete!: (value: ProductAttributes) => void
  mocks.assignTemplate.mockImplementationOnce(
    () =>
      new Promise<ProductAttributes>((resolve) => {
        complete = resolve
      })
  )
  mount()
  await userEvent.click(
    await screen.findByRole("button", { name: "Adopt latest version" })
  )
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled()
  )
  expect(screen.getByRole("button", { name: "Change template" })).toBeDisabled()
  complete({ ...view, template: { ...view.template!, version: 2 } })
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled()
  )
})

test("public product and variant widget contracts use supported zones and native identifiers", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <ProductWidget data={{ id: "product" } as AdminProduct} />
    </QueryClientProvider>
  )
  expect(
    await screen.findByRole("region", { name: "Specifications" })
  ).toBeInTheDocument()
  expect(productConfig.zone).toBe("product.details")
  expect(variantConfig.zone).toBe("product_variant.details")
  unmount()
  const mountVariant = (
    product_id?: string,
    path = "/products/product/variants/variant"
  ) =>
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/products/:id/variants/:variant_id"
              element={
                <VariantWidget
                  data={{ id: "variant", product_id } as AdminProductVariant}
                />
              }
            />
            <Route
              path="/plain"
              element={
                <VariantWidget
                  data={{ id: "variant", product_id } as AdminProductVariant}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  const direct = mountVariant("product")
  expect(
    await screen.findByRole("region", { name: "Variant specifications" })
  ).toBeInTheDocument()
  direct.unmount()
  const fallback = mountVariant()
  expect(
    await screen.findByRole("region", { name: "Variant specifications" })
  ).toBeInTheDocument()
  fallback.unmount()
  mountVariant(undefined, "/plain")
  await waitFor(() => expect(mocks.product).toHaveBeenLastCalledWith(""))
})
