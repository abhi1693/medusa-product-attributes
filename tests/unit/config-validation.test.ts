import { describe, expect, it } from "vitest"
import {
  defineTemplate,
  fieldSchema,
  resolveModuleOptions,
  resolveOptions,
  templateSchema,
} from "../../src/config"
import {
  applicableTemplate,
  isRecord,
  mergeValues,
  validateValues,
} from "../../src/validation"
import type { AttributeField, TemplateDefinition } from "../../src/types"

export const field: AttributeField = {
  key: "model",
  label: "Model",
  type: "text",
  scope: "product",
  required: true,
  searchable: true,
  filterable: false,
  comparable: true,
}
export const definition: TemplateDefinition = {
  key: "network",
  name: "Network",
  fields: [field],
}
const select = {
  ...field,
  type: "single_select" as const,
  options: [{ value: "802.11ax", label: "Wi-Fi 6" }],
}

describe("template contracts", () => {
  it("normalizes definitions and retains explicit numeric units and real-world choice codes", () => {
    expect(defineTemplate({ ...definition, name: " Network " })).toMatchObject({
      name: "Network",
      description: "",
      category_ids: [],
    })
    expect(
      fieldSchema.parse({
        ...field,
        type: "number",
        min: 0,
        max: 10,
        unit: " W ",
      }).unit
    ).toBe("W")
    expect(fieldSchema.parse(select).options?.[0].value).toBe("802.11ax")
    expect(fieldSchema.parse({ ...select, type: "multi_select" }).type).toBe(
      "multi_select"
    )
    expect(fieldSchema.parse({ ...field, options: [] }).options).toEqual([])
  })
  it.each([
    { ...field, key: "bad-key" },
    { ...field, key: "constructor" },
    { ...field, key: "prototype" },
    { ...field, label: " " },
    { ...field, type: "number", min: 2, max: 1 },
    { ...field, min: 1 },
    { ...field, max: 1 },
    { ...field, unit: "W" },
    { ...select, options: [] },
    { ...select, options: undefined },
    { ...field, options: select.options },
    { ...select, options: [...select.options, ...select.options] },
    { ...select, options: [{ value: " ", label: "Empty" }] },
    { ...field, unexpected: true },
  ])("rejects an invalid field %#", (value) =>
    expect(fieldSchema.safeParse(value).success).toBe(false)
  )
  it("rejects duplicate identities, unknown properties and unbounded schemas", () => {
    for (const value of [
      { ...definition, fields: [field, field] },
      { ...definition, category_ids: ["cat", "cat"] },
      { ...definition, fields: [] },
      { ...definition, fields: Array(101).fill(field) },
      { ...definition, extra: 1 },
    ])
      expect(templateSchema.safeParse(value).success).toBe(false)
  })
  it("validates runtime configuration and optional authorization without assigning products", () => {
    expect(
      resolveModuleOptions({
        database: { clientUrl: "postgres://localhost/test" },
      })
    ).toEqual(resolveOptions())
    expect(resolveModuleOptions()).toEqual(resolveOptions())
    expect(resolveOptions()).toEqual({
      metadata_key: "product_attributes",
      templates: [],
      register_native_hooks: true,
    })
    const authorize = () => true
    expect(
      resolveOptions({
        templates: [definition],
        metadata_key: "specifications",
        authorize,
        register_native_hooks: false,
      })
    ).toMatchObject({
      metadata_key: "specifications",
      authorize,
      register_native_hooks: false,
    })
    for (const value of [
      { metadata_key: "" },
      { authorize: true },
      { register_native_hooks: "yes" },
      { templates: {} },
      { unexpected: true },
      { templates: Array(1001).fill(definition) },
    ])
      expect(() => resolveOptions(value as never)).toThrow()
    expect(() =>
      resolveOptions({ templates: [definition, definition] })
    ).toThrow("Configured template keys must be unique")
  })
})

describe("safe scope value merging", () => {
  it("recognizes records and merges explicit clear without assigning prototypes", () => {
    for (const value of [null, [], undefined, 0])
      expect(isRecord(value)).toBe(false)
    expect(isRecord({})).toBe(true)
    const patch = JSON.parse(
      '{"model":null,"enabled":false,"__proto__":"safe"}'
    )
    const result = mergeValues({ model: "old", ports: 0 }, patch)
    expect(result).toEqual(
      JSON.parse('{"ports":0,"enabled":false,"__proto__":"safe"}')
    )
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })
})

describe("scoped typed values", () => {
  const fields: AttributeField[] = [
    field,
    { ...field, key: "power", type: "number", min: 0, max: 100 },
    { ...field, key: "enabled", type: "boolean" },
    { ...select, key: "standard" },
    { ...select, key: "standards", type: "multi_select" },
    { ...field, key: "serial", scope: "variant" },
    { ...field, key: "optional", required: false },
  ]
  it("accepts canonical numbers, false, controlled choices and separate variant values", () => {
    expect(
      validateValues(
        fields,
        {
          model: "X",
          power: 0,
          enabled: false,
          standard: "802.11ax",
          standards: ["802.11ax"],
        },
        "product",
        true
      )
    ).toEqual([])
    expect(validateValues(fields, { serial: "S" }, "variant", true)).toEqual([])
    expect(validateValues(fields, {}, "product")).toEqual([])
    expect(validateValues([], {}, "product", true)).toEqual([])
    expect(
      validateValues(
        [{ ...select, options: undefined }],
        { model: "x" },
        "product"
      )[0].code
    ).toBe("choice")
    expect(
      validateValues([{ ...field, type: "number" }], { model: 10 }, "product")
    ).toEqual([])
  })
  it("treats blank/empty values as missing only when a complete required record is needed", () => {
    for (const value of [undefined, null, "", "   ", []]) {
      expect(
        validateValues([field], { model: value }, "product", false)
      ).toEqual([])
      expect(
        validateValues([field], { model: value }, "product", true)[0].code
      ).toBe("required")
    }
    expect(
      validateValues(
        [field],
        Object.create({ model: "inherited" }),
        "product",
        true
      )[0].code
    ).toBe("required")
    expect(validateValues([field], {}, "product", true, "custom")[0].path).toBe(
      "custom.model"
    )
  })
  it("reports unknown scope, numeric ranges and every invalid type/choice", () => {
    expect(validateValues(fields, null, "product")[0].code).toBe("type")
    expect(
      validateValues(
        fields,
        { serial: "wrong scope", unknown: 1 },
        "product"
      ).map((issue) => issue.code)
    ).toEqual(["unknown", "unknown"])
    for (const value of ["1", Infinity, NaN, true])
      expect(validateValues(fields, { power: value }, "product")[0].code).toBe(
        "type"
      )
    for (const value of [-1, 101])
      expect(validateValues(fields, { power: value }, "product")[0].code).toBe(
        "range"
      )
    for (const value of ["false", 1])
      expect(
        validateValues(fields, { enabled: value }, "product")[0].code
      ).toBe("type")
    for (const value of [1, "x".repeat(2001)])
      expect(validateValues(fields, { model: value }, "product")[0].code).toBe(
        "type"
      )
    for (const value of [1, "unknown"])
      expect(
        validateValues(fields, { standard: value }, "product")[0].code
      ).toBe("choice")
    for (const value of [
      1,
      [1],
      ["unknown"],
      ["802.11ax", "802.11ax"],
      Array(101).fill("802.11ax"),
    ])
      expect(
        validateValues(fields, { standards: value }, "product")[0].code
      ).toBe("choice")
    expect(
      validateValues(fields, { enabled: true, power: 100 }, "product")
    ).toEqual([])
  })
})

it("selects only explicitly applicable fields and rejects invalid selections", () => {
  const template = {
    ...definition,
    id: "template",
    version: 1,
    source: "admin" as const,
    archived: false,
    description: "",
    category_ids: [],
    fields: [field, { ...field, key: "other" }],
  }
  const assignment = { template_id: template.id, template_version: 1 }
  expect(applicableTemplate(template, assignment)).toBe(template)
  const selected = applicableTemplate(template, {
    ...assignment,
    field_keys: ["model"],
  })
  expect(selected.fields).toEqual([field])
  expect(selected).toMatchObject({ field_keys: ["model"] })
  for (const field_keys of [
    [],
    ["missing"],
    ["model", "model"],
    Array(101).fill("model"),
  ])
    expect(() =>
      applicableTemplate(template, { ...assignment, field_keys })
    ).toThrow("unique fields")
  expect(template.fields).toHaveLength(2)
})
