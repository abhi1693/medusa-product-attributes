import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  fireEvent,
  render as renderBase,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { beforeEach, expect, test, vi } from "vitest"
import type { TemplateRevision } from "../../src/types"

const mocks = vi.hoisted(() => ({
  prompt: vi.fn(),
  categories: vi.fn(),
  template: vi.fn(),
}))
vi.mock("@medusajs/ui", async (original) => ({
  ...(await original<typeof import("@medusajs/ui")>()),
  usePrompt: () => mocks.prompt,
}))
vi.mock("../../src/admin/lib/api", () => ({
  sdk: { admin: { productCategory: { list: mocks.categories } } },
  attributesApi: { template: mocks.template },
}))
import {
  emptyField,
  templateDraft,
  TemplateEditor,
} from "../../src/admin/components/template-editor"

const template: TemplateRevision = {
  id: "template",
  key: "switch",
  name: "Switch",
  description: "Device",
  category_ids: ["cat_network"],
  version: 2,
  archived: false,
  source: "admin",
  fields: [
    {
      ...emptyField(),
      key: "ports",
      label: "Ports",
      type: "number",
      unit: "ports",
      min: 0,
      max: 48,
    },
  ],
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.prompt.mockReset().mockResolvedValue(true)
  mocks.categories.mockReset().mockResolvedValue({
    product_categories: [{ id: "cat_network", name: "Networking" }],
    count: 1,
    offset: 0,
    limit: 10,
  })
  mocks.template.mockReset().mockResolvedValue({
    template: { ...template, version: 3, name: "Newer switch" },
  })
})
const render = (element: ReactElement) =>
  renderBase(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {element}
    </QueryClientProvider>
  )
const select = async (label: string, option: string) => {
  await userEvent.click(screen.getByLabelText(label, { exact: true }))
  await userEvent.click(screen.getByRole("option", { name: option }))
}

test("drafts preserve immutable originals and duplicates require a new stable key", () => {
  expect(emptyField().type).toBe("text")
  expect(templateDraft().fields).toHaveLength(1)
  const copy = templateDraft(template, true)
  expect(copy).toMatchObject({
    key: "",
    name: "Switch copy",
    category_ids: ["cat_network"],
  })
  expect(copy.version).toBeUndefined()
  copy.fields[0].label = "Changed"
  expect(template.fields[0].label).toBe("Ports")
  expect(templateDraft(template).version).toBe(2)
})

test("template schema editor configures typed fields, choices, flags and ordering", async () => {
  const user = userEvent.setup()
  const save = vi.fn().mockResolvedValue(undefined)
  const close = vi.fn()
  render(<TemplateEditor onSave={save} onClose={close} />)
  expect(screen.getByLabelText("Key")).toHaveAttribute(
    "pattern",
    "[a-z][a-z0-9_]{0,63}"
  )
  await user.type(screen.getByLabelText("Name"), "Switch")
  await user.type(screen.getByLabelText("Key"), "switch")
  await user.type(screen.getByLabelText(/Description/), "Device specifications")
  await user.type(screen.getByLabelText("Label", { exact: true }), "Ports")
  await user.type(screen.getByLabelText("Field key"), "ports")
  await select("Type", "Number")
  await user.type(screen.getByLabelText("Unit"), "ports")
  fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "0" } })
  fireEvent.change(screen.getByLabelText("Maximum"), {
    target: { value: "48" },
  })
  fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "" } })
  fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "" } })
  await select("Applies to", "Variant")
  for (const name of ["Required", "Searchable", "Filterable", "Comparable"])
    await user.click(screen.getByLabelText(name))
  await user.click(screen.getByLabelText("Required"))
  await user.click(screen.getByRole("button", { name: "Add field" }))
  await user.type(
    screen.getAllByLabelText("Label", { exact: true })[0],
    " capacity"
  )
  expect(screen.getAllByLabelText("Label", { exact: true })[1]).toHaveValue("")
  await user.click(screen.getByRole("button", { name: "Move field 2 up" }))
  await user.click(screen.getByRole("button", { name: "Remove field 2" }))
  await user.type(
    screen.getByLabelText("Label", { exact: true }),
    "Supported features"
  )
  await user.type(screen.getByLabelText("Field key"), "features")
  await select("Type", "Single choice")
  await user.click(screen.getByRole("button", { name: "Add choice" }))
  await user.click(screen.getByRole("button", { name: "Add choice" }))
  await user.type(screen.getByLabelText("Field 1 choice 1 label"), "PoE")
  await user.type(screen.getByLabelText("Field 1 choice 1 value"), "poe")
  await user.type(screen.getByLabelText("Field 1 choice 2 label"), "SFP")
  await user.type(screen.getByLabelText("Field 1 choice 2 value"), "sfp")
  await user.click(
    screen.getByRole("button", { name: "Remove field 1 choice 1" })
  )
  await select("Type", "Multiple choices")
  await user.click(screen.getByRole("button", { name: "Add choice" }))
  await user.type(screen.getByLabelText("Field 1 choice 1 label"), "PoE")
  await user.type(screen.getByLabelText("Field 1 choice 1 value"), "poe")
  await user.click(
    screen.getByRole("combobox", { name: "Suggested categories" })
  )
  await user.click(screen.getByRole("option", { name: "Networking" }))
  await user.click(screen.getByLabelText("Name"))
  await user.click(screen.getByRole("button", { name: "Create group" }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toMatchObject({
    key: "switch",
    name: "Switch",
    category_ids: ["cat_network"],
    fields: [
      {
        key: "features",
        type: "multi_select",
        options: [{ label: "PoE", value: "poe" }],
      },
    ],
  })
  expect(close).toHaveBeenCalledOnce()
})

test("new versions keep template identity and show category loading failures without losing selection", async () => {
  mocks.categories.mockRejectedValue(new Error("Category access denied"))
  render(
    <TemplateEditor template={template} onSave={vi.fn()} onClose={vi.fn()} />
  )
  expect(screen.getByRole("heading", { name: "Version 3" })).toBeInTheDocument()
  expect(screen.getByLabelText("Key")).toBeDisabled()
  expect(screen.getByLabelText("Minimum")).toHaveValue(0)
  expect(screen.getByLabelText("Maximum")).toHaveValue(48)
  expect(
    await screen.findByText(/Categories could not be loaded/)
  ).toBeInTheDocument()
})

test("empty schema, cancellation, discard confirmation and stale save failures preserve edits", async () => {
  const user = userEvent.setup()
  const close = vi.fn()
  const save = vi.fn().mockRejectedValue({ status: 409 })
  const { unmount } = render(<TemplateEditor onSave={save} onClose={close} />)
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(close).toHaveBeenCalledOnce()
  await user.type(screen.getByLabelText("Name"), "Unsaved")
  mocks.prompt.mockResolvedValueOnce(false)
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(close).toHaveBeenCalledOnce()
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(close).toHaveBeenCalledTimes(2)
  fireEvent.submit(screen.getByLabelText("Name").closest("form")!)
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your edits are preserved"
  )
  expect(screen.getByLabelText("Name")).toHaveValue("Unsaved")
  await user.click(screen.getByRole("button", { name: "Remove field 1" }))
  expect(
    screen.getByText("Add a field to define this template.")
  ).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled()
  unmount()
})

test("pending submission prevents modal cancellation and duplication starts a new identity", async () => {
  const user = userEvent.setup()
  const close = vi.fn()
  let complete!: () => void
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve
      })
  )
  render(
    <TemplateEditor
      template={{ ...template, description: "", category_ids: [] }}
      duplicate
      onSave={save}
      onClose={close}
    />
  )
  expect(screen.getByLabelText("Name")).toHaveValue("Switch copy")
  expect(screen.getByLabelText("Key")).toHaveValue("")
  fireEvent.submit(screen.getByLabelText("Name").closest("form")!)
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  expect(screen.getByLabelText("Name")).toBeDisabled()
  await user.keyboard("{Escape}")
  expect(close).not.toHaveBeenCalled()
  complete()
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
})

test("stale template revisions retain edits and reload only after confirmation, including failed reload recovery", async () => {
  const user = userEvent.setup()
  const save = vi.fn().mockRejectedValue({ status: 409 })
  render(<TemplateEditor template={template} onSave={save} onClose={vi.fn()} />)
  await user.clear(screen.getByLabelText("Name"))
  await user.type(screen.getByLabelText("Name"), "Unsaved schema")
  await user.click(screen.getByRole("button", { name: "Create version" }))
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your edits are preserved"
  )
  expect(screen.getByRole("button", { name: "Create version" })).toBeDisabled()
  mocks.prompt.mockResolvedValueOnce(false)
  await user.click(screen.getByRole("button", { name: "Reload latest" }))
  expect(screen.getByLabelText("Name")).toHaveValue("Unsaved schema")
  expect(mocks.template).not.toHaveBeenCalled()
  mocks.template.mockRejectedValueOnce(new Error("Reload unavailable"))
  await user.click(screen.getByRole("button", { name: "Reload latest" }))
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Reload unavailable"
  )
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Reload latest" })).toHaveFocus()
  )
  expect(screen.getByLabelText("Name")).toHaveValue("Unsaved schema")
  await user.click(screen.getByRole("button", { name: "Reload latest" }))
  await waitFor(() =>
    expect(screen.getByLabelText("Name")).toHaveValue("Newer switch")
  )
  await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus())
  expect(screen.getByRole("heading", { name: "Version 4" })).toBeInTheDocument()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Create version" })).toBeEnabled()
})
