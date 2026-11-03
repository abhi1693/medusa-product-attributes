import { expect, test } from "vitest"
import { attributeSections } from "../../src/admin/lib/attribute-sections"
import type { AttributeField } from "../../src/types"

test("groups presentation sections in first-seen order while preserving leaf keys and order", () => {
  const field = {
    key: "one",
    label: "One",
    type: "text",
    scope: "product",
    required: false,
    searchable: false,
    filterable: false,
    comparable: false,
  } as AttributeField
  const fields = [
    field,
    { ...field, key: "hd", subsection: "Cameras" },
    { ...field, key: "ports", subsection: "Networking" },
    { ...field, key: "4k", subsection: "Cameras" },
  ]
  expect(
    attributeSections(fields).map((section) => [
      section.name,
      section.fields.map((field) => field.key),
    ])
  ).toEqual([
    [undefined, ["one"]],
    ["Cameras", ["hd", "4k"]],
    ["Networking", ["ports"]],
  ])
  expect(attributeSections([])).toEqual([])
  expect(fields).toHaveLength(4)
})
