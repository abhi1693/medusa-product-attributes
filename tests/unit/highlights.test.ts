import { expect, test } from "vitest"
import { effectiveHighlightKeys } from "../../src/highlight-selection"
import { validateHighlightKeys } from "../../src/highlights"
import type { AttributeField } from "../../src/types"
const fields = Array.from({ length: 8 }, (_, i) => ({
  key: `field_${i}`,
  label: `Field ${i}`,
  type: "number",
  scope: i % 2 ? "variant" : "product",
  required: false,
  searchable: false,
  filterable: false,
  comparable: false,
})) as AttributeField[]
test("untouched and reset settings preserve six schema-ordered defaults", () => {
  expect(effectiveHighlightKeys(undefined, fields)).toEqual(
    fields.slice(0, 6).map((f) => f.key)
  )
  expect(effectiveHighlightKeys(null, fields)).toHaveLength(6)
  expect(effectiveHighlightKeys(null, [])).toEqual([])
  expect(validateHighlightKeys(null, fields)).toBeNull()
})
test("explicit empty selection hides and custom order survives regardless of schema order", () => {
  expect(effectiveHighlightKeys([], fields)).toEqual([])
  expect(
    effectiveHighlightKeys(["field_5", "field_1", "removed"], fields)
  ).toEqual(["field_5", "field_1"])
  expect(validateHighlightKeys(["field_5", "field_1"], fields)).toEqual([
    "field_5",
    "field_1",
  ])
  expect(validateHighlightKeys([], fields)).toEqual([])
})
test.each([
  ["field_1", "field_1"],
  ["unknown"],
  [123],
  fields.slice(0, 7).map((f) => f.key),
  "invalid",
])("rejects invalid selections at the owning service boundary %j", (keys) => {
  expect(() => validateHighlightKeys(keys as any, fields)).toThrow(
    "Choose up to six"
  )
})
