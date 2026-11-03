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
  template: vi.fn(),
  saveValues: vi.fn(),
  assignGroups: vi.fn(),
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
  groups: [
    {
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
  ],
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
  mocks.template.mockImplementation(async (id: string) => ({
    template: { ...view.groups[0], id, version: id === "template" ? 2 : 1 },
    revisions: [{ ...view.groups[0], id }],
  }))
  mocks.saveValues.mockResolvedValue({
    ...view,
    version: "product_v2",
    values: { ports: 24 },
  })
  mocks.assignGroups.mockResolvedValue({
    ...view,
    version: "product_v2",
    groups: [{ ...view.groups[0]!, version: 2 }],
  })
  mocks.prompt.mockResolvedValue(true)
})

test("product attributes preserve typed values and save through a focused native drawer", async () => {
  const user = userEvent.setup()
  mount()
  expect(
    await screen.findByRole("region", { name: "Product attributes" })
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
    await screen.findByRole("region", { name: "Variant attributes" })
  ).toHaveTextContent("White")
  expect(
    screen.queryByRole("button", { name: "Manage attribute templates" })
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
  mocks.product.mockResolvedValue({ ...view, groups: [], values: {} })
  mount()
  expect(await screen.findByText("No attribute templates")).toBeInTheDocument()
  await user.click(
    screen.getByRole("button", { name: "Manage attribute templates" })
  )
  expect(
    await screen.findByRole("button", { name: "Save templates" })
  ).toBeEnabled()
  await user.click(
    screen.getByRole("combobox", { name: "Attribute templates" })
  )
  await user.click(screen.getByRole("option", { name: "Switch · v2" }))
  await user.keyboard("{Escape}")
  await user.click(
    await screen.findByRole("button", { name: "Save templates" })
  )
  await waitFor(() =>
    expect(mocks.assignGroups).toHaveBeenCalledWith("product", {
      version: "product_v1",
      groups: [
        {
          template_id: "template",
          template_version: 2,
          field_keys: ["ports", "colour"],
        },
      ],
    })
  )
  expect(mocks.prompt).not.toHaveBeenCalled()
})

test("category recommendations come from the server and leave other templates available for explicit assignment", async () => {
  const user = userEvent.setup()
  mocks.product.mockResolvedValue({
    ...view,
    groups: [],
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
    await screen.findByRole("button", {
      name: "Manage attribute templates",
    })
  )
  expect(
    screen.getByText(/Recommended groups match this product/)
  ).toBeInTheDocument()
  expect(mocks.assignGroups).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole("combobox", { name: "Attribute templates" })
  )
  expect(
    screen.getByRole("option", { name: "Switch · v2 · Recommended" })
  ).toBeInTheDocument()
  await user.click(screen.getByRole("option", { name: "General device · v1" }))
  expect(mocks.assignGroups).not.toHaveBeenCalled()
  await user.keyboard("{Escape}")
  await user.click(
    await screen.findByRole("button", { name: "Save templates" })
  )
  await waitFor(() =>
    expect(mocks.assignGroups).toHaveBeenCalledWith("product", {
      version: "product_v1",
      groups: [
        {
          template_id: "alternative",
          template_version: 1,
          field_keys: ["ports", "colour"],
        },
      ],
    })
  )
})

test("removing groups requires confirmation and stale assignment errors support refresh", async () => {
  const user = userEvent.setup()
  mount()
  await user.click(
    await screen.findByRole("button", {
      name: "Manage attribute templates",
    })
  )
  await user.click(
    screen.getByRole("combobox", { name: "Attribute templates" })
  )
  await user.click(screen.getByRole("option", { name: "Switch · v2" }))
  await user.keyboard("{Escape}")
  mocks.prompt.mockResolvedValueOnce(false)
  await user.keyboard("{Escape}")
  await user.click(
    await screen.findByRole("button", { name: "Save templates" })
  )
  expect(mocks.assignGroups).not.toHaveBeenCalled()
  mocks.assignGroups.mockRejectedValueOnce({ status: 409 })
  await user.keyboard("{Escape}")
  await user.click(
    await screen.findByRole("button", { name: "Save templates" })
  )
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your edits are preserved"
  )
  await user.click(screen.getByRole("button", { name: "Reload" }))
  await waitFor(() => expect(mocks.product).toHaveBeenCalledTimes(2))
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
    groups: [{ ...view.groups[0]!, fields: [] }],
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
    await screen.findByText("Variant attributes unavailable")
  ).toBeInTheDocument()
  missing.unmount()
  mocks.product.mockResolvedValue({
    ...view,
    groups: [{ ...view.groups[0]!, fields: [] }],
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
  mocks.product.mockResolvedValue({ ...view, groups: [], templates: [] })
  const { unmount } = mount("variant")
  expect(
    await screen.findByText(/Add attribute templates on the product/)
  ).toBeInTheDocument()
  unmount()
  mount()
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Manage attribute templates",
    })
  )
  expect(screen.getByText(/No active groups are available/)).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole("button", { name: "Manage attribute templates" })
  )
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
})

test("loading, failed reads and permission denial recover without breaking native pages", async () => {
  mocks.product.mockImplementationOnce(() => new Promise(() => {}))
  const { unmount } = mount()
  expect(screen.getByText("Loading attributes…")).toBeInTheDocument()
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
  mocks.assignGroups.mockImplementationOnce(
    () =>
      new Promise<ProductAttributes>((resolve) => {
        complete = resolve
      })
  )
  mount()
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Manage attribute templates",
    })
  )
  await userEvent.click(
    await screen.findByRole("button", { name: "Save templates" })
  )
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled()
  )
  expect(
    screen.getByRole("button", { name: "Manage attribute templates" })
  ).toBeDisabled()
  complete({ ...view, groups: [{ ...view.groups[0]!, version: 2 }] })
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
    await screen.findByRole("region", { name: "Product attributes" })
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
    await screen.findByRole("region", { name: "Variant attributes" })
  ).toBeInTheDocument()
  direct.unmount()
  const fallback = mountVariant()
  expect(
    await screen.findByRole("region", { name: "Variant attributes" })
  ).toBeInTheDocument()
  fallback.unmount()
  mountVariant(undefined, "/plain")
  await waitFor(() => expect(mocks.product).toHaveBeenLastCalledWith(""))
})

test("one product displays and edits several reusable typed groups without JSON", async () => {
  const power = {
    ...view.groups[0],
    id: "power",
    key: "power",
    name: "Power",
    fields: [
      {
        ...view.groups[0].fields[0],
        key: "power_w",
        label: "Maximum power",
        unit: "W",
        help: "Device consumption, excluding PoE output",
        required: false,
      },
    ],
  }
  const software = {
    ...view.groups[0],
    id: "software",
    key: "software",
    name: "Software",
    fields: [
      {
        ...view.groups[0].fields[0],
        key: "meshing",
        label: "Wireless meshing",
        type: "boolean" as const,
        unit: undefined,
        required: false,
      },
    ],
  }
  mocks.product.mockResolvedValue({
    ...view,
    groups: [view.groups[0], power, software],
    values: { ports: 8, power_w: 9, meshing: false },
  })
  mount()
  expect(
    await screen.findByRole("heading", { name: "Power" })
  ).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Software" })).toBeInTheDocument()
  expect(screen.getByText("9 W")).toBeInTheDocument()
  expect(screen.getByText("No")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Edit" }))
  expect(
    screen.getByText("Device consumption, excluding PoE output")
  ).toBeInTheDocument()
  expect(screen.getByLabelText("Maximum power")).toHaveAttribute(
    "type",
    "number"
  )
  expect(
    screen.getByRole("combobox", { name: "Wireless meshing" })
  ).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText("Maximum power"), {
    target: { value: "10" },
  })
  await userEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() =>
    expect(mocks.saveValues).toHaveBeenCalledWith("product", {
      version: view.version,
      values: { ports: 8, power_w: 10, meshing: false },
    })
  )
})

test("applicable fields are editable while the existing selection and pinned version are preserved", async () => {
  const user = userEvent.setup()
  mocks.product.mockResolvedValue({
    ...view,
    groups: [{ ...view.groups[0], field_keys: ["ports"] }],
  })
  mount()
  await screen.findByRole("region", { name: "Product attributes" })
  await user.click(
    screen.getByRole("button", { name: "Manage attribute templates" })
  )
  const selector = await screen.findByRole("combobox", {
    name: "Applicable fields · Switch",
  })
  await user.click(selector)
  await user.click(screen.getByRole("option", { name: "Ports" }))
  await user.keyboard("{Escape}")
  expect(screen.getByRole("button", { name: "Save templates" })).toBeDisabled()
  await user.click(selector)
  await user.click(screen.getByRole("option", { name: "Colour" }))
  await user.keyboard("{Escape}")
  await user.click(screen.getByRole("button", { name: "Save templates" }))
  await waitFor(() =>
    expect(mocks.assignGroups).toHaveBeenCalledWith("product", {
      version: view.version,
      groups: [
        {
          template_id: "template",
          template_version: 1,
          field_keys: ["colour"],
        },
      ],
    })
  )
})

test("loading template definitions can fail and recover without losing current product values", async () => {
  const user = userEvent.setup()
  mocks.template.mockRejectedValueOnce(new Error("Template read unavailable"))
  mount()
  await screen.findByRole("region", { name: "Product attributes" })
  await user.click(
    screen.getByRole("button", { name: "Manage attribute templates" })
  )
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Template read unavailable"
  )
  await user.click(
    screen.getByRole("button", { name: "Manage attribute templates" })
  )
  await screen.findByRole("combobox", { name: "Applicable fields · Switch" })
  await user.click(
    screen.getByRole("button", { name: "Manage attribute templates" })
  )
  expect(
    screen.queryByRole("combobox", { name: "Applicable fields · Switch" })
  ).not.toBeInTheDocument()
  expect(screen.getByText("0 ports")).toBeInTheDocument()
  await user.click(
    screen.getByRole("button", { name: "Manage attribute templates" })
  )
  await screen.findByRole("combobox", { name: "Applicable fields · Switch" })
  expect(mocks.template).toHaveBeenCalledTimes(2)
})
