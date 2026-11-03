import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { expect, test, vi } from "vitest"
import type { TemplateRevision } from "../../src/types"

vi.mock("../../src/admin/lib/api", () => ({
  sdk: {
    admin: {
      productCategory: {
        list: vi.fn().mockResolvedValue({
          product_categories: [],
          count: 0,
          offset: 0,
          limit: 10,
        }),
      },
    },
  },
  attributesApi: { template: vi.fn() },
}))
import {
  emptyField,
  TemplateEditor,
} from "../../src/admin/components/template-editor"
import { restoreFocus } from "../../src/admin/lib/focus"

const largeTemplate: TemplateRevision = {
  id: "large",
  key: "many_fields",
  name: "Large attributes",
  description: "",
  category_ids: [],
  version: 1,

  archived: false,
  fields: Array.from({ length: 30 }, (_, index) => ({
    ...emptyField(),
    key: `property_${index}`,
    label: `Property ${index + 1}`,
  })),
}
const mount = (
  save = vi.fn().mockResolvedValue(undefined),
  close = vi.fn()
) => {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TemplateEditor template={largeTemplate} onSave={save} onClose={close} />
    </QueryClientProvider>
  )
  return { save, close }
}

test("large schemas use the native discard prompt above the editor and keep keyboard focus inside the active dialog", async () => {
  const user = userEvent.setup()
  const { close } = mount()
  const modal = screen.getByRole("dialog")
  await user.type(screen.getByLabelText("Name"), " revised")
  const lastField = screen.getAllByLabelText("Field key").at(-1)!
  await user.click(lastField)
  await user.keyboard("{Escape}")
  const prompt = await screen.findByRole("alertdialog", {
    name: "Discard changes?",
  })
  expect(modal).not.toContainElement(prompt)
  const keepEditing = within(prompt).getByRole("button", {
    name: "Keep editing",
  })
  await waitFor(() => expect(keepEditing).toHaveFocus())
  await user.keyboard("{Enter}")
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  )
  await waitFor(() => expect(modal.contains(document.activeElement)).toBe(true))
  expect(lastField).toHaveFocus()
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByLabelText("Name")).toHaveValue("Large attributes revised")
  await user.click(lastField)
  await user.keyboard("{Escape}")
  const secondPrompt = await screen.findByRole("alertdialog", {
    name: "Discard changes?",
  })
  await user.keyboard("{Escape}")
  await waitFor(() => expect(secondPrompt).not.toBeInTheDocument())
  expect(close).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  const finalPrompt = await screen.findByRole("alertdialog", {
    name: "Discard changes?",
  })
  await user.click(within(finalPrompt).getByRole("button", { name: "Discard" }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
})

test("focus restoration tolerates an unmounted or absent target", () => {
  const input = document.createElement("input")
  input.remove()
  expect(() => restoreFocus(input)).not.toThrow()
  expect(() => restoreFocus(null)).not.toThrow()
})

test("a controlled editor restores focus to the action that opened it", async () => {
  const user = userEvent.setup()
  const Harness = () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open template editor</button>
        {open && (
          <TemplateEditor
            template={largeTemplate}
            onSave={vi.fn()}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    )
  }
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Harness />
    </QueryClientProvider>
  )
  const opener = screen.getByRole("button", { name: "Open template editor" })
  await user.click(opener)
  expect(await screen.findByRole("dialog")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  )
  await waitFor(() => expect(opener).toHaveFocus())
})

test("save failures remain outside the long scrolling schema body", async () => {
  const { save } = mount(
    vi.fn().mockRejectedValue(new Error("Save unavailable"))
  )
  const form = screen.getByLabelText("Name").closest("form")!
  fireEvent.submit(form)
  const alert = await screen.findByRole("alert")
  expect(save).toHaveBeenCalledOnce()
  expect(alert).toHaveTextContent("Save unavailable")
  expect(alert.parentElement).toBe(form)
})
