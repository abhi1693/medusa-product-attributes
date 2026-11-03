import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, expect, test, vi } from "vitest"
import type { TemplateRevision } from "../../src/types"

const mocks = vi.hoisted(() => ({
  templates: vi.fn(),
  template: vi.fn(),
  templateProducts: vi.fn(),
  createTemplate: vi.fn(),
  reviseTemplate: vi.fn(),
  archiveTemplate: vi.fn(),
  prompt: vi.fn(),
}))
vi.mock("../../src/admin/lib/api", () => ({
  attributesApi: mocks,
  attributesKeys: {
    templates: ["attributes", "templates"],
    template: (id: string) => ["attributes", "templates", id],
  },
}))
vi.mock("@medusajs/ui", async (original) => ({
  ...(await original<typeof import("@medusajs/ui")>()),
  usePrompt: () => mocks.prompt,
}))
vi.mock("../../src/admin/components/template-editor", () => ({
  TemplateEditor: ({
    onSave,
    onClose,
    duplicate,
  }: {
    onSave: (draft: unknown) => Promise<void>
    onClose: () => void
    duplicate?: boolean
  }) => (
    <div role="dialog" aria-label="Template editor">
      <span>{duplicate ? "Duplicate editor" : "Schema editor"}</span>
      <button
        onClick={() => {
          void onSave({ key: "device", name: "Device", fields: [] }).then(
            onClose
          )
        }}
      >
        Submit editor
      </button>
      <button onClick={onClose}>Close editor</button>
    </div>
  ),
}))

import ListPage, {
  config,
} from "../../src/admin/routes/settings/product-attributes/page"
import DetailPage, {
  handle,
} from "../../src/admin/routes/settings/product-attributes/[id]/page"

const template: TemplateRevision = {
  id: "template",
  key: "switch",
  name: "Network switch",
  version: 2,
  source: "admin",
  archived: false,
  description: "Network device specifications",
  category_ids: [],
  fields: [
    {
      key: "ports",
      label: "Ports",
      type: "number",
      scope: "product",
      unit: "ports",
      required: true,
      searchable: true,
      filterable: true,
      comparable: true,
    },
    {
      key: "poe",
      label: "PoE",
      type: "boolean",
      scope: "variant",
      required: false,
      searchable: false,
      filterable: false,
      comparable: false,
    },
  ],
}
const listData = (can_write = true) => ({
  templates: [
    template,
    { ...template, id: "configured", source: "configuration", archived: true },
  ],
  count: 41,
  offset: 0,
  limit: 20,
  can_write,
})
const detailData = (can_write = true) => ({
  template,
  revisions: [{ ...template, version: 1 }, template],
  can_write,
})
const mount = (detail = false) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          detail
            ? "/settings/product-attributes/template"
            : "/settings/product-attributes",
        ]}
      >
        <Routes>
          <Route path="/settings/product-attributes" element={<ListPage />} />
          <Route
            path="/settings/product-attributes/:id"
            element={<DetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.templates.mockResolvedValue(listData())
  mocks.template.mockResolvedValue(detailData())
  mocks.templateProducts.mockResolvedValue({
    assignments: [],
    current_version: 2,
    count: 0,
    offset: 0,
    limit: 20,
  })
  mocks.createTemplate.mockResolvedValue(detailData())
  mocks.reviseTemplate.mockResolvedValue(detailData())
  mocks.archiveTemplate.mockResolvedValue(detailData())
  mocks.prompt.mockResolvedValue(true)
})

test("template list searches, paginates, includes archived records and creates schemas", async () => {
  const user = userEvent.setup()
  mount()
  expect(
    (await screen.findAllByRole("link", { name: /Network switch switch/ }))[0]
  ).toHaveAttribute("href", "/settings/product-attributes/template")
  expect(screen.getByText("Configuration")).toBeInTheDocument()
  expect(screen.getByText("Archived")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Next" }))
  await waitFor(() =>
    expect(mocks.templates).toHaveBeenLastCalledWith({
      q: "",
      offset: 20,
      limit: 20,
      include_archived: false,
    })
  )
  await user.click(screen.getByRole("button", { name: "Previous" }))
  await user.click(screen.getByLabelText("Include archived"))
  fireEvent.change(screen.getByLabelText("Search templates"), {
    target: { value: "switch" },
  })
  await waitFor(() =>
    expect(mocks.templates).toHaveBeenLastCalledWith({
      q: "switch",
      offset: 0,
      limit: 20,
      include_archived: true,
    })
  )
  await user.click(screen.getByRole("button", { name: "Create group" }))
  await user.click(screen.getByRole("button", { name: "Submit editor" }))
  await waitFor(() =>
    expect(mocks.createTemplate).toHaveBeenCalledWith({
      key: "device",
      name: "Device",
      fields: [],
    })
  )
  expect(config.label).toBe("Specification groups")
})

test("list distinguishes first-use emptiness, filtered emptiness and read-only access", async () => {
  mocks.templates.mockResolvedValue({
    ...listData(false),
    templates: [],
    count: 0,
  })
  const { unmount } = mount()
  expect(await screen.findByText("No templates yet")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled()
  expect(screen.getByText(/Read-only access/)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText("Search templates"), {
    target: { value: "missing" },
  })
  expect(await screen.findByText("No matching templates")).toBeInTheDocument()
  unmount()
})

test("list loading and errors are recoverable", async () => {
  mocks.templates.mockImplementationOnce(() => new Promise(() => {}))
  const { unmount } = mount()
  expect(screen.getByText("Loading templates…")).toBeInTheDocument()
  unmount()
  mocks.templates.mockRejectedValueOnce(new Error("Offline"))
  mount()
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline")
  await userEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(await screen.findAllByText("Network switch")).toHaveLength(2)
})

test("template detail displays immutable history and supports new-version and duplicate flows", async () => {
  const user = userEvent.setup()
  mount(true)
  expect(
    await screen.findByRole("heading", { name: "Network switch" })
  ).toBeInTheDocument()
  expect(screen.getByText("number · ports")).toBeInTheDocument()
  expect(screen.getByText("Variant")).toBeInTheDocument()
  expect(screen.getByText("Required")).toBeInTheDocument()
  expect(screen.getByText("Current")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Create version" }))
  expect(screen.getByText("Schema editor")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Submit editor" }))
  await waitFor(() =>
    expect(mocks.reviseTemplate).toHaveBeenCalledWith("template", {
      key: "device",
      name: "Device",
      fields: [],
    })
  )
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  )
  await user.click(screen.getByRole("button", { name: "Duplicate" }))
  expect(screen.getByText("Duplicate editor")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Submit editor" }))
  await waitFor(() => expect(mocks.createTemplate).toHaveBeenCalled())
  expect(handle.breadcrumb()).toBe("Template")
})

test("archival requires confirmation, preserves failure feedback and recovers on retry", async () => {
  const user = userEvent.setup()
  mount(true)
  const button = await screen.findByRole("button", { name: "Archive" })
  mocks.prompt.mockResolvedValueOnce(false)
  await user.click(button)
  expect(mocks.archiveTemplate).not.toHaveBeenCalled()
  mocks.archiveTemplate.mockRejectedValueOnce({ status: 409 })
  await user.click(button)
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "changed while you were editing"
  )
  await user.click(button)
  await waitFor(() =>
    expect(mocks.archiveTemplate).toHaveBeenLastCalledWith("template", 2)
  )
})

test("managed, archived and read-only templates cannot be revised or archived", async () => {
  mocks.template.mockResolvedValue({
    ...detailData(false),
    template: {
      ...template,
      source: "configuration",
      description: "",
      archived: true,
    },
  })
  mount(true)
  expect(
    await screen.findByText("Managed in configuration")
  ).toBeInTheDocument()
  expect(screen.getByText(/Update this definition/)).toBeInTheDocument()
  expect(screen.getByText("You have read-only access.")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Create version" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled()
})

test("detail loading and denied reads use the same recoverable boundary", async () => {
  mocks.template.mockImplementationOnce(() => new Promise(() => {}))
  const { unmount } = mount(true)
  expect(screen.getByText("Loading template…")).toBeInTheDocument()
  unmount()
  mocks.template.mockRejectedValueOnce({ status: 403 })
  mount(true)
  expect(await screen.findByRole("alert")).toHaveTextContent("permission")
  await userEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(
    await screen.findByRole("heading", { name: "Network switch" })
  ).toBeInTheDocument()
})

test("product impact permission denial does not prevent viewing or editing a template", async () => {
  mocks.templateProducts.mockRejectedValueOnce({ status: 403 })
  mount(true)
  expect(
    await screen.findByRole("heading", { name: "Network switch" })
  ).toBeInTheDocument()
  expect(await screen.findByText("Product access required")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Create version" })).toBeEnabled()
  expect(
    screen.getByRole("heading", { name: "Version history" })
  ).toBeInTheDocument()
})

test("template and field totals use neutral count labels for a single result", async () => {
  mocks.templates.mockResolvedValue({
    ...listData(),
    templates: [template],
    count: 1,
  })
  const list = mount()
  expect(await screen.findByText("Templates: 1")).toBeInTheDocument()
  list.unmount()
  mocks.template.mockResolvedValue({
    ...detailData(),
    revisions: [{ ...template, fields: [template.fields[0]] }],
  })
  mount(true)
  expect(await screen.findByText("Version 2 · Fields: 1")).toBeInTheDocument()
})
