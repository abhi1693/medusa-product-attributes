import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react"
import { beforeEach, expect, test, vi } from "vitest"
import type { ProductAttributes } from "../../src/types"
const mocks = vi.hoisted(() => ({
  product: vi.fn(),
  saveHighlights: vi.fn(),
  prompt: vi.fn(),
}))
vi.mock("../../src/admin/lib/api", () => ({
  attributesApi: mocks,
  attributesKeys: { product: (id: string) => ["attributes", id] },
}))
vi.mock("@medusajs/ui", async (original) => ({
  ...(await original<typeof import("@medusajs/ui")>()),
  usePrompt: () => mocks.prompt,
}))
import {
  StorefrontHighlights,
  HighlightsEditor,
} from "../../src/admin/components/highlights"
import ProductHighlights, {
  config,
} from "../../src/admin/widgets/product-highlights"
const fields = Array.from({ length: 7 }, (_, i) => ({
  key: `field_${i}`,
  label: `Field ${i}`,
  type: "number" as const,
  scope: i % 2 ? ("variant" as const) : ("product" as const),
  required: false,
  searchable: false,
  filterable: false,
  comparable: false,
  ...(i === 0 ? { unit: "W" } : {}),
}))
const base: ProductAttributes = {
  product_id: "prod_one",
  assignment_version: 1,
  version: "rev_one",
  can_write: true,
  can_assign: true,
  groups: [
    {
      id: "group",
      key: "hardware",
      name: "Hardware",
      version: 1,
      description: "",
      category_ids: [],
      archived: false,
      fields,
    },
  ],
  values: { field_0: 10 },
  variants: [],
  validation: [],
  templates: [],
  highlight_keys: null,
}
let current: ProductAttributes
beforeEach(() => {
  vi.resetAllMocks()
  current = structuredClone(base)
  mocks.product.mockImplementation(async () => current)
  mocks.saveHighlights.mockImplementation(
    async (_id, input) =>
      (current = { ...current, ...input, version: "rev_two" })
  )
  mocks.prompt.mockResolvedValue(true)
})
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ProductHighlights data={{ id: "prod_one" } as any} />
    </QueryClientProvider>
  )
  return client
}
async function edit() {
  setup()
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit highlights" })
  )
  await screen.findByRole("dialog")
}
const custom = () =>
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Use default highlights" })
  )
test("is a separate stable product widget with loading, defaults and read-only states", async () => {
  expect(config.zone).toBe("product.details")
  expect(config.id).toBe("product-attributes:storefront-highlights")
  let resolve!: (value: ProductAttributes) => void
  mocks.product.mockImplementation(
    () => new Promise((done) => (resolve = done))
  )
  setup()
  expect(screen.getByRole("status")).toHaveTextContent("Loading highlights")
  await act(async () => resolve({ ...current, can_write: false }))
  expect(await screen.findByText("Default selection · 6/6")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Edit highlights" })).toBeNull()
})
test("loads errors with retry and unassigned empty state", async () => {
  mocks.product.mockRejectedValueOnce(Error("Offline"))
  setup()
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }))
  expect(
    await screen.findByRole("button", { name: "Edit highlights" })
  ).toBeInTheDocument()
})
test("unassigned products explain how to enable highlights", async () => {
  current = { ...current, groups: [] }
  setup()
  expect(
    await screen.findByText(
      "Assign specification attributes before choosing highlights."
    )
  ).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Edit highlights" })).toBeNull()
})
test("saves exact selected order with the original version, scoped to this product", async () => {
  current = { ...current, highlight_keys: ["field_0", "field_1"] }
  await edit()
  fireEvent.click(screen.getByRole("button", { name: "Move Field 1 up" }))
  expect(
    within(screen.getByRole("list", { name: "Highlight order" })).getAllByRole(
      "listitem"
    )[0]
  ).toHaveTextContent("Field 1")
  fireEvent.click(screen.getByRole("button", { name: "Move Field 1 down" }))
  fireEvent.click(screen.getByRole("checkbox", { name: "Hardware: Field 2" }))
  fireEvent.change(screen.getByRole("textbox", { name: "Find an attribute" }), {
    target: { value: "Field 2" },
  })
  expect(
    screen.queryByRole("checkbox", { name: "Hardware: Field 6" })
  ).toBeNull()
  fireEvent.change(screen.getByRole("textbox", { name: "Find an attribute" }), {
    target: { value: "No matching field" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Save highlights" }))
  await waitFor(() =>
    expect(mocks.saveHighlights).toHaveBeenCalledWith("prod_one", {
      version: "rev_one",
      highlight_keys: ["field_0", "field_1", "field_2"],
    })
  )
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(current.values).toEqual(base.values)
})
test("bounds selection at six and explicit empty selection hides the grid", async () => {
  current = { ...current, highlight_keys: [] }
  await edit()
  expect(screen.getByText(/No highlights selected/)).toBeInTheDocument()
  for (let i = 0; i < 6; i++)
    fireEvent.click(
      screen.getByRole("checkbox", { name: `Hardware: Field ${i}` })
    )
  expect(
    screen.getByRole("checkbox", { name: "Hardware: Field 6" })
  ).toBeDisabled()
  for (let i = 0; i < 6; i++)
    fireEvent.click(
      screen.getByRole("checkbox", { name: `Hardware: Field ${i}` })
    )
  fireEvent.click(screen.getByRole("button", { name: "Save highlights" }))
  expect(
    await screen.findByText("Highlights are hidden for this product.")
  ).toBeInTheDocument()
  expect(mocks.saveHighlights).toHaveBeenCalledWith("prod_one", {
    version: "rev_one",
    highlight_keys: [],
  })
})
test("restores defaults explicitly and cancels without saving", async () => {
  current = { ...current, highlight_keys: [] }
  await edit()
  custom()
  fireEvent.click(screen.getByRole("button", { name: "Save highlights" }))
  await waitFor(() =>
    expect(mocks.saveHighlights).toHaveBeenCalledWith("prod_one", {
      version: "rev_one",
      highlight_keys: null,
    })
  )
})
test("preserves dirty drafts when discard is declined and closes cleanly when accepted", async () => {
  await edit()
  custom()
  mocks.prompt.mockResolvedValueOnce(false)
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(mocks.prompt).toHaveBeenCalled())
  expect(screen.getByRole("dialog")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(mocks.saveHighlights).not.toHaveBeenCalled()
})
test("closes a clean editor without discard confirmation", async () => {
  await edit()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(mocks.prompt).not.toHaveBeenCalled()
})
test("reports failed saves without losing edits", async () => {
  mocks.saveHighlights.mockRejectedValue(Error("Offline"))
  await edit()
  custom()
  fireEvent.click(screen.getByRole("button", { name: "Save highlights" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline")
  expect(
    screen.getByRole("list", { name: "Highlight order" })
  ).toBeInTheDocument()
})
test("stale saves require explicit reload; failed reload retains recovery controls", async () => {
  mocks.saveHighlights.mockRejectedValue({ status: 409, message: "Changed" })
  await edit()
  fireEvent.click(screen.getByRole("button", { name: "Save highlights" }))
  const reload = await screen.findByRole("button", { name: "Reload latest" })
  expect(screen.getByRole("button", { name: "Save highlights" })).toBeDisabled()
  mocks.prompt.mockResolvedValueOnce(false)
  fireEvent.click(reload)
  await waitFor(() => expect(mocks.prompt).toHaveBeenCalled())
  expect(screen.getByRole("dialog")).toBeInTheDocument()
  mocks.product.mockRejectedValueOnce(Error("Reload unavailable"))
  fireEvent.click(reload)
  expect(await screen.findByText("Reload unavailable")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Reload latest" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})
test("blocks closing and repeat saves while a mutation is pending", async () => {
  let resolve!: (view: ProductAttributes) => void
  mocks.saveHighlights.mockImplementation(
    () => new Promise((done) => (resolve = done))
  )
  await edit()
  fireEvent.click(screen.getByRole("button", { name: "Save highlights" }))
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  )
  fireEvent.keyDown(document, { key: "Escape" })
  await act(async () => resolve(current))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})
