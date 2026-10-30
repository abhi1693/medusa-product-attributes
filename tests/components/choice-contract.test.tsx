import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import type { AttributeField } from "../../src/types"

// The public Combobox callback permits an undefined cleared value.
// Native interactions are covered separately; this checks our boundary adapter.
vi.mock("@medusajs/dashboard/components", () => ({
  Combobox: ({ onChange }: { onChange: (value: undefined) => void }) => (
    <button onClick={() => onChange(undefined)}>
      Clear returned selection
    </button>
  ),
}))
import { AttributeInput } from "../../src/admin/components/attribute-input"

test("an unset public choice callback becomes an explicit metadata clear", async () => {
  const field: AttributeField = {
    key: "choice",
    label: "Choice",
    type: "single_select",
    scope: "product",
    required: false,
    searchable: false,
    filterable: false,
    comparable: false,
    options: [{ value: "poe", label: "PoE" }],
  }
  const change = vi.fn()
  render(<AttributeInput field={field} value="poe" onChange={change} />)
  await userEvent.click(
    screen.getByRole("button", { name: "Clear returned selection" })
  )
  expect(change).toHaveBeenCalledWith(null)
})
