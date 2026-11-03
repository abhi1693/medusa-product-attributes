import { MedusaError } from "@medusajs/framework/utils"
import { expect, test, vi } from "vitest"
import Service from "../../src/modules/product-attributes/service"
import type {
  ProductAttributesOptions,
  TemplateDefinition,
  TemplateRevision,
} from "../../src/types"

const definition: TemplateDefinition = {
  key: "switch",
  name: "Switch",
  fields: [
    {
      key: "ports",
      label: "Ports",
      type: "number",
      scope: "product",
      required: true,
      searchable: false,
      filterable: true,
      comparable: true,
    },
  ],
}
const revision: TemplateRevision = {
  ...definition,
  id: "pat_switch",
  description: "",
  category_ids: [],
  version: 3,
  archived: false,
}
function harness(
  options: ProductAttributesOptions = {},
  ...responses: unknown[]
) {
  const execute = vi.fn().mockResolvedValue([])
  for (const response of responses) execute.mockResolvedValueOnce(response)
  const service = new Service({}, options),
    manager = { execute }
  return {
    service,
    execute,
    manager,
    context: { manager, transactionManager: manager } as any,
  }
}

test("validates options without a runtime definition mode", () => {
  expect(harness().service.configuration.metadata_key).toBe(
    "product_attributes"
  )
  expect(() => harness({ metadata_key: "bad-key" })).toThrow()
  expect(
    harness({ metadata_key: "attributes" }).service.configuration.metadata_key
  ).toBe("attributes")
})
test("paginates and searches active templates with bound SQL parameters", async () => {
  const h = harness({}, [revision], [{ count: "42" }], [], [{ count: "0" }])
  expect(await h.service.page(undefined, h.context)).toEqual({
    templates: [revision],
    count: 42,
    offset: 0,
    limit: 25,
  })
  expect(h.execute.mock.calls[0][0]).toContain("archived = false")
  expect(h.execute.mock.calls[0][1]).toEqual([0, 25])
  expect(
    await h.service.page(
      { q: "switch'", offset: 20, limit: 10, include_archived: true },
      { manager: h.manager } as any
    )
  ).toEqual({ templates: [], count: 0, offset: 20, limit: 10 })
  expect(h.execute.mock.calls[2][0]).not.toContain("switch'")
  expect(h.execute.mock.calls[2][0]).not.toContain("archived = false")
  expect(h.execute.mock.calls[2][1]).toEqual(["%switch'%", "%switch'%", 20, 10])
})
test("reads immutable versions and optional defaults, preserving historical reads after deletion", async () => {
  const h = harness(
    {},
    [{ ...revision, definition }],
    [
      {
        ...revision,
        definition: {
          ...definition,
          description: "Hardware",
          category_ids: ["category"],
        },
      },
    ],
    []
  )
  expect(await h.service.revision(revision.id, undefined, h.context)).toEqual(
    revision
  )
  expect(h.execute.mock.calls[0][1]).toEqual([null, revision.id, null])
  expect(
    await h.service.revision(revision.id, 2, { manager: h.manager } as any)
  ).toEqual({
    ...revision,
    description: "Hardware",
    category_ids: ["category"],
  })
  expect(h.execute.mock.calls[1][1]).toEqual([2, revision.id, 2])
  await expect(
    h.service.revision("missing", 1, h.context)
  ).rejects.toMatchObject({ type: MedusaError.Types.NOT_FOUND })
})
test("returns descending revision history and handles an empty history", async () => {
  const h = harness({}, [{ version: 3 }, { version: 1 }], [])
  vi.spyOn(h.service, "revision").mockImplementation(async (_id, version) => ({
    ...revision,
    version: version!,
  }))
  expect(await h.service.history(revision.id, h.context)).toEqual([
    revision,
    { ...revision, version: 1 },
  ])
  expect(
    await h.service.history("missing", { manager: h.manager } as any)
  ).toEqual([])
})
test("creates a database template and actor-attributed immutable revision", async () => {
  const h = harness()
  vi.spyOn(h.service, "revision").mockImplementation(async (id, version) => ({
    ...revision,
    id,
    version: version!,
  }))
  const result = await h.service.save(
    definition,
    "user",
    undefined,
    undefined,
    h.context
  )
  expect(result.id).toMatch(/^pat_/)
  expect(result.version).toBe(1)
  expect(h.execute.mock.calls[2][0]).toContain(
    "insert into product_attribute_template"
  )
  expect(h.execute.mock.calls[3][1][4]).toBe("user")
  const duplicate = harness({}, [], [{ id: "existing" }])
  await expect(
    duplicate.service.save(
      definition,
      "user",
      undefined,
      undefined,
      duplicate.context
    )
  ).rejects.toThrow("already exists")
  const invalid = harness()
  await expect(
    invalid.service.save(
      { ...definition, fields: [] },
      "user",
      undefined,
      undefined,
      invalid.context
    )
  ).rejects.toThrow()
  expect(invalid.execute).not.toHaveBeenCalled()
})
test("revisions require the current version, stable key and an active template", async () => {
  const h = harness()
  const read = vi
    .spyOn(h.service, "revision")
    .mockImplementation(async (id, version) => ({
      ...revision,
      id,
      version: version || revision.version,
    }))
  expect(
    (
      await h.service.save(
        { ...definition, name: "Changed" },
        "user",
        revision.id,
        3,
        h.context
      )
    ).version
  ).toBe(4)
  expect(h.execute.mock.calls[1][1]).toEqual(["Changed", 4, revision.id])
  await expect(
    h.service.save(definition, "user", revision.id, 2, h.context)
  ).rejects.toThrow("changed")
  await expect(
    h.service.save(
      { ...definition, key: "other" },
      "user",
      revision.id,
      3,
      h.context
    )
  ).rejects.toThrow("key cannot change")
  read.mockResolvedValueOnce({ ...revision, archived: true })
  await expect(
    h.service.save(definition, "user", revision.id, 3, h.context)
  ).rejects.toThrow("Archived")
})
test("archives without replacing immutable definitions and checks the current version", async () => {
  const h = harness()
  vi.spyOn(h.service, "revision")
    .mockResolvedValueOnce(revision)
    .mockResolvedValueOnce({ ...revision, archived: true })
    .mockResolvedValue(revision)
  expect((await h.service.archive(revision.id, 3, h.context)).archived).toBe(
    true
  )
  expect(h.execute.mock.calls[1][0]).toContain("archived=true")
  await expect(h.service.archive(revision.id, 2, h.context)).rejects.toThrow(
    "changed"
  )
})
test("deletes only unused templates with a current version while retaining history", async () => {
  const h = harness()
  vi.spyOn(h.service, "revision").mockResolvedValue(revision)
  expect(await h.service.remove(revision.id, 3, h.context)).toEqual({
    id: revision.id,
    deleted: true,
  })
  expect(h.execute.mock.calls[2][0]).toContain("deleted_at=now()")
  await expect(h.service.remove(revision.id, 1, h.context)).rejects.toThrow(
    "changed"
  )
  h.execute
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: "assigned" }])
  await expect(h.service.remove(revision.id, 3, h.context)).rejects.toThrow(
    "assigned products"
  )
})
test("seed replay leaves edited, archived and deleted keys untouched", async () => {
  const h = harness(
    {},
    [],
    [],
    [{ id: "edited" }],
    [{ id: "archived" }],
    [{ id: "deleted" }]
  )
  const save = vi.spyOn(h.service, "save").mockResolvedValue(revision)
  const definitions = [
    definition,
    ...["edited", "archived", "deleted"].map((key) => ({ ...definition, key })),
  ]
  expect(
    await h.service.seedDefinitions(definitions, "user_seed", h.context)
  ).toEqual({ created: 1, skipped: 3 })
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ key: definition.key }),
    "user_seed",
    undefined,
    undefined,
    h.context
  )
  expect(await h.service.seedDefinitions([], undefined, h.context)).toEqual({
    created: 0,
    skipped: 0,
  })
  const invalid = harness()
  await expect(
    invalid.service.seedDefinitions(
      [definition, definition],
      "user",
      invalid.context
    )
  ).rejects.toThrow("unique")
  expect(invalid.execute).not.toHaveBeenCalled()
})
