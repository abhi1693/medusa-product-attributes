import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import {
  AttributeInput,
  formatAttributeValue,
} from "../../src/admin/components/attribute-input"
import { errorMessage, Feedback } from "../../src/admin/components/feedback"
import type { AttributeField } from "../../src/types"

const field: AttributeField = {
  key: "ports",
  label: "Ports",
  type: "number",
  scope: "product",
  required: true,
  unit: "ports",
  searchable: false,
  filterable: true,
  comparable: true,
}

test("typed display preserves zero, false, choices, units and empty values", () => {
  expect(formatAttributeValue(field, 0)).toBe("0 ports")
  expect(formatAttributeValue(field, null)).toBe("Not set")
  expect(formatAttributeValue(field, undefined)).toBe("Not set")
  expect(formatAttributeValue(field, "")).toBe("Not set")
  expect(formatAttributeValue(field, [])).toBe("Not set")
  expect(formatAttributeValue(field, true)).toBe("Yes")
  expect(formatAttributeValue(field, false)).toBe("No")
  const choices = {
    ...field,
    unit: undefined,
    options: [{ value: "poe", label: "PoE" }],
  }
  expect(formatAttributeValue(choices, ["poe", "other"])).toBe("PoE, other")
  expect(formatAttributeValue(choices, "poe")).toBe("PoE")
  expect(formatAttributeValue(choices, "other")).toBe("other")
  expect(
    formatAttributeValue({ ...choices, options: undefined }, "plain")
  ).toBe("plain")
})

test("number and text controls submit typed values with explicit clearing", () => {
  const change = vi.fn()
  const { rerender } = render(
    <AttributeInput field={field} value={undefined} onChange={change} />
  )
  fireEvent.change(screen.getByLabelText("Ports"), { target: { value: "0" } })
  expect(change).toHaveBeenLastCalledWith(0)
  rerender(<AttributeInput field={field} value={0} onChange={change} />)
  fireEvent.change(screen.getByLabelText("Ports"), { target: { value: "" } })
  expect(change).toHaveBeenLastCalledWith(null)
  rerender(
    <AttributeInput
      field={{ ...field, type: "text", required: false, unit: undefined }}
      value={null}
      onChange={change}
    />
  )
  fireEvent.change(screen.getByLabelText("Ports"), {
    target: { value: "Ethernet" },
  })
  expect(change).toHaveBeenLastCalledWith("Ethernet")
  rerender(
    <AttributeInput
      field={{ ...field, type: "text", unit: undefined }}
      value="Ethernet"
      onChange={change}
    />
  )
  expect(screen.getByLabelText("Ports")).toHaveValue("Ethernet")
})

test("boolean control distinguishes unset from Yes and No", async () => {
  const user = userEvent.setup()
  const change = vi.fn()
  const boolean = { ...field, type: "boolean" as const, unit: undefined }
  const { rerender } = render(
    <AttributeInput field={boolean} value={null} onChange={change} />
  )
  await user.click(screen.getByRole("combobox", { name: "Ports" }))
  await user.click(screen.getByRole("option", { name: "Yes" }))
  expect(change).toHaveBeenLastCalledWith(true)
  rerender(<AttributeInput field={boolean} value={true} onChange={change} />)
  await user.click(screen.getByRole("combobox", { name: "Ports" }))
  await user.click(screen.getByRole("option", { name: "No" }))
  expect(change).toHaveBeenLastCalledWith(false)
  rerender(<AttributeInput field={boolean} value={false} onChange={change} />)
  await user.click(screen.getByRole("combobox", { name: "Ports" }))
  await user.click(screen.getByRole("option", { name: "Not set" }))
  expect(change).toHaveBeenLastCalledWith(null)
  rerender(
    <AttributeInput field={boolean} value={undefined} onChange={change} />
  )
  expect(screen.getByRole("combobox", { name: "Ports" })).toHaveTextContent(
    "Not set"
  )
})

test("choice fields use constrained searchable native controls", async () => {
  const user = userEvent.setup()
  const change = vi.fn()
  const single = {
    ...field,
    type: "single_select" as const,
    options: [{ value: "poe", label: "PoE" }],
  }
  const { rerender } = render(
    <AttributeInput field={single} value={undefined} onChange={change} />
  )
  await user.click(screen.getByRole("combobox", { name: "Ports" }))
  await user.click(screen.getByRole("option", { name: "PoE" }))
  expect(change).toHaveBeenLastCalledWith("poe")
  rerender(<AttributeInput field={single} value="poe" onChange={change} />)
  await user.click(screen.getByRole("button", { name: /clear/i }))
  expect(change).toHaveBeenLastCalledWith(null)
  rerender(
    <AttributeInput
      field={{ ...single, type: "multi_select" }}
      value={null}
      onChange={change}
    />
  )
  await user.click(screen.getByRole("combobox", { name: "Ports" }))
  await user.click(screen.getByRole("option", { name: "PoE" }))
  expect(change).toHaveBeenLastCalledWith(["poe"])
  rerender(
    <AttributeInput
      field={{ ...single, type: "multi_select", options: undefined }}
      value={[]}
      onChange={change}
    />
  )
  expect(screen.getByRole("combobox", { name: "Ports" })).toBeInTheDocument()
})

test("feedback provides actionable, permission and stale-write explanations", async () => {
  expect(errorMessage({ status: 409 })).toContain("Your edits are preserved")
  expect(errorMessage({ status: 403 })).toContain("permission")
  expect(errorMessage(new Error("Network unavailable"))).toBe(
    "Network unavailable"
  )
  expect(errorMessage({})).toContain("try again")
  expect(errorMessage(null)).toContain("try again")
  const retry = vi.fn()
  const { rerender } = render(
    <Feedback title="Unable to load" error retry={retry}>
      Try later.
    </Feedback>
  )
  expect(screen.getByRole("alert")).toHaveTextContent("Try later")
  await userEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(retry).toHaveBeenCalledOnce()
  rerender(<Feedback title="Loading…" />)
  expect(screen.getByRole("status")).toHaveTextContent("Loading")
})
