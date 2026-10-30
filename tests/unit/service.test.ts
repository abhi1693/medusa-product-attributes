import { MedusaError } from "@medusajs/framework/utils"
import { describe, expect, test, vi } from "vitest"
import ProductAttributesService from "../../src/modules/product-attributes/service"
import type {
  ProductAttributesOptions,
  ProductTemplateBinding,
  TemplateDefinition,
  TemplateRevision,
} from "../../src/types"

const definition: TemplateDefinition = {
  key: "switch",
  name: "Network switch",
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
  source: "admin",
  archived: false,
}
const binding: ProductTemplateBinding = {
  id: "pab_switch",
  product_id: "prod_switch",
  template_id: revision.id,
  template_version: 2,
  version: 3,
}

function harness(
  options: ProductAttributesOptions = {},
  ...responses: unknown[]
) {
  const execute = vi.fn().mockResolvedValue([])
  for (const response of responses) execute.mockResolvedValueOnce(response)
  // Preserve the real Medusa service factory and context decorators. Replace
  // only the database port; integration tests exercise real PostgreSQL.
  const service = new ProductAttributesService({}, options)
  const manager = { execute }
  const context = { manager, transactionManager: manager } as any
  return { service, manager, execute, context }
}

describe("template service database and revision boundaries", () => {
  test("validates options on construction and reads bindings through the supplied context", async () => {
    expect(new ProductAttributesService({}).configuration.metadata_key).toBe(
      "product_attributes"
    )
    expect(
      () => new ProductAttributesService({}, { metadata_key: "bad-key" })
    ).toThrow()
    const h = harness({ metadata_key: "specifications" }, [binding], [])
    expect(h.service.configuration.metadata_key).toBe("specifications")
    expect(await h.service.binding(binding.product_id, h.context)).toEqual(
      binding
    )
    expect(
      await h.service.binding("prod_unassigned", { manager: h.manager } as any)
    ).toBeNull()
    expect(h.execute.mock.calls.map(([, params]) => params)).toEqual([
      [binding.product_id],
      ["prod_unassigned"],
    ])
  })

  test("reserves new and existing bindings under a lock and rejects stale reservations", async () => {
    const created = harness({}, [], [])
    const receipt = await created.service.reserveBinding(
      "prod_switch",
      revision.id,
      3,
      0,
      created.context
    )
    expect(receipt.before).toBeNull()
    expect(receipt.after).toEqual({
      id: expect.stringMatching(/^pab_/),
      product_id: "prod_switch",
      template_id: revision.id,
      template_version: 3,
      version: 1,
    })
    expect(created.execute.mock.calls[0][0]).toContain("pg_advisory_xact_lock")
    expect(created.execute.mock.calls[2][1]).toEqual([
      receipt.after.id,
      "prod_switch",
      revision.id,
      3,
      1,
    ])
    const updated = harness({}, [], [binding])
    expect(
      await updated.service.reserveBinding(
        "prod_switch",
        revision.id,
        3,
        3,
        updated.context
      )
    ).toEqual({
      before: binding,
      after: { ...binding, template_version: 3, version: 4 },
    })
    expect(updated.execute.mock.calls[2][1]).toEqual([
      revision.id,
      3,
      4,
      binding.id,
    ])
    for (const current of [[], [binding]]) {
      const stale = harness({}, [], current)
      await expect(
        stale.service.reserveBinding(
          "prod_switch",
          revision.id,
          3,
          2,
          stale.context
        )
      ).rejects.toMatchObject({ type: MedusaError.Types.CONFLICT })
      expect(stale.execute).toHaveBeenCalledTimes(2)
    }
  })

  test("compensates only the exact reserved revision and preserves intervening changes", async () => {
    const after = { ...binding, template_version: 3, version: 4 }
    const existing = harness({}, [], [after])
    await existing.service.restoreBinding(
      { before: binding, after },
      existing.context
    )
    expect(existing.execute.mock.calls[2][1]).toEqual([
      binding.template_id,
      binding.template_version,
      binding.version,
      binding.id,
    ])
    const created = harness({}, [], [after])
    await created.service.restoreBinding(
      { before: null, after },
      created.context
    )
    expect(created.execute.mock.calls[2]).toEqual([
      expect.stringMatching(/^delete from product_attribute_binding/),
      [after.id],
    ])
    for (const current of [[], [binding]]) {
      const stale = harness({}, [], current)
      await expect(
        stale.service.restoreBinding({ before: binding, after }, stale.context)
      ).rejects.toMatchObject({ type: MedusaError.Types.CONFLICT })
      expect(stale.execute).toHaveBeenCalledTimes(2)
    }
  })

  test("paginates active templates with parameterized search and a numeric total", async () => {
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
    expect(h.execute.mock.calls[2][0]).not.toContain("archived = false")
    expect(h.execute.mock.calls[2][0]).not.toContain("switch'")
    expect(h.execute.mock.calls[2][1]).toEqual([
      "%switch'%",
      "%switch'%",
      20,
      10,
    ])
    expect(h.execute.mock.calls[3][1]).toEqual(["%switch'%", "%switch'%"])
  })

  test("retrieves immutable versions and supplies defaults for optional definition properties", async () => {
    const nativeRow = { ...revision, definition }
    const defined = {
      ...nativeRow,
      definition: {
        ...definition,
        description: "Hardware",
        category_ids: ["pcat_network"],
      },
    }
    const h = harness({}, [nativeRow], [defined], [])
    expect(await h.service.revision(revision.id, undefined, h.context)).toEqual(
      revision
    )
    expect(h.execute.mock.calls[0][1]).toEqual([null, revision.id])
    expect(
      await h.service.revision(revision.id, 2, { manager: h.manager } as any)
    ).toEqual({
      ...revision,
      description: "Hardware",
      category_ids: ["pcat_network"],
    })
    expect(h.execute.mock.calls[1][1]).toEqual([2, revision.id])
    await expect(
      h.service.revision("missing", 1, h.context)
    ).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
    })
  })

  test("returns history in persisted descending version order", async () => {
    const h = harness({}, [{ version: 3 }, { version: 1 }], [])
    const read = vi
      .spyOn(h.service, "revision")
      .mockImplementation(async (_id, version) => ({
        ...revision,
        version: version!,
      }))
    expect(await h.service.history(revision.id, h.context)).toEqual([
      revision,
      { ...revision, version: 1 },
    ])
    expect(read.mock.calls.map(([id, version]) => [id, version])).toEqual([
      [revision.id, 3],
      [revision.id, 1],
    ])
    expect(
      await h.service.history("missing", { manager: h.manager } as any)
    ).toEqual([])
  })

  test("creates an Admin template with an atomic immutable actor-attributed revision", async () => {
    const h = harness()
    vi.spyOn(h.service, "revision").mockImplementation(async (id, version) => ({
      ...revision,
      id,
      version: version!,
    }))
    const created = await h.service.save(
      definition,
      "user_admin",
      undefined,
      undefined,
      h.context
    )
    expect(created.id).toMatch(/^pat_/)
    expect(created.version).toBe(1)
    expect(h.execute.mock.calls[0][0]).toContain("pg_advisory_xact_lock")
    expect(h.execute.mock.calls[2][1]).toEqual([
      created.id,
      definition.key,
      definition.name,
    ])
    const written = h.execute.mock.calls[3][1]
    expect(written.slice(0, 3)).toEqual([
      expect.stringMatching(/^par_/),
      created.id,
      1,
    ])
    expect(JSON.parse(written[3])).toEqual({
      ...definition,
      description: "",
      category_ids: [],
    })
    expect(written[4]).toBe("user_admin")
    const duplicate = harness({}, [], [{ id: "pat_existing" }])
    await expect(
      duplicate.service.save(
        definition,
        "user_admin",
        undefined,
        undefined,
        duplicate.context
      )
    ).rejects.toThrow("already exists")
    expect(duplicate.execute).toHaveBeenCalledTimes(2)
    const invalid = harness()
    await expect(
      invalid.service.save(
        { ...definition, fields: [] },
        "user_admin",
        undefined,
        undefined,
        invalid.context
      )
    ).rejects.toThrow()
    expect(invalid.execute).not.toHaveBeenCalled()
  })

  test("revises only active Admin-managed templates with the expected immutable key and version", async () => {
    const h = harness()
    const read = vi
      .spyOn(h.service, "revision")
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce({
        ...revision,
        name: "Updated switch",
        version: 4,
      })
    expect(
      await h.service.save(
        { ...definition, name: "Updated switch" },
        "user_editor",
        revision.id,
        3,
        h.context
      )
    ).toEqual({ ...revision, name: "Updated switch", version: 4 })
    expect(h.execute.mock.calls[1][1]).toEqual([
      "Updated switch",
      4,
      revision.id,
    ])
    expect(h.execute.mock.calls[2][1][4]).toBe("user_editor")
    expect(read.mock.calls[1].slice(0, 2)).toEqual([revision.id, 4])
    for (const [previous, version, message] of [
      [
        { ...revision, source: "configuration" },
        3,
        "application configuration",
      ],
      [revision, 2, "record changed"],
      [{ ...revision, key: "other_key" }, 3, "key cannot change"],
      [{ ...revision, archived: true }, 3, "cannot be revised"],
    ] as const) {
      const denied = harness()
      vi.spyOn(denied.service, "revision").mockResolvedValue(previous)
      await expect(
        denied.service.save(
          definition,
          "user_admin",
          revision.id,
          version,
          denied.context
        )
      ).rejects.toThrow(message)
      expect(denied.execute).toHaveBeenCalledTimes(1)
    }
  })

  test("archives Admin templates without mutating existing revisions or configured definitions", async () => {
    const h = harness()
    vi.spyOn(h.service, "revision")
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce({ ...revision, archived: true })
    expect(await h.service.archive(revision.id, 3, h.context)).toEqual({
      ...revision,
      archived: true,
    })
    expect(h.execute.mock.calls[1]).toEqual([
      expect.stringMatching(
        /^update product_attribute_template set archived=true/
      ),
      [revision.id],
    ])
    for (const [previous, version, message] of [
      [
        { ...revision, source: "configuration" },
        3,
        "application configuration",
      ],
      [revision, 2, "record changed"],
    ] as const) {
      const denied = harness()
      vi.spyOn(denied.service, "revision").mockResolvedValue(previous)
      await expect(
        denied.service.archive(revision.id, version, denied.context)
      ).rejects.toThrow(message)
      expect(denied.execute).toHaveBeenCalledTimes(1)
    }
  })

  test("synchronizes new configured definitions and attributes their revision to configuration", async () => {
    const h = harness({ templates: [definition] })
    expect(await h.service.synchronize(h.context)).toEqual({ changed: 1 })
    const inserted = h.execute.mock.calls[2][1]
    expect(inserted).toEqual([
      expect.stringMatching(/^pat_/),
      definition.key,
      definition.name,
      1,
    ])
    expect(h.execute.mock.calls[3][0]).toContain("'system:configuration'")
    expect(JSON.parse(h.execute.mock.calls[3][1][3])).toEqual(
      h.service.configuration.templates[0]
    )
    const empty = harness()
    expect(await empty.service.synchronize(empty.context)).toEqual({
      changed: 0,
    })
  })

  test("leaves identical active configuration unchanged but revisions changed or reactivated definitions", async () => {
    const configured = { ...revision, source: "configuration" as const }
    const stable = harness(
      { templates: [definition] },
      [],
      [configured],
      [{ id: configured.id, key: configured.key }]
    )
    vi.spyOn(stable.service, "revision").mockResolvedValue(configured)
    expect(await stable.service.synchronize(stable.context)).toEqual({
      changed: 0,
    })
    expect(stable.execute).toHaveBeenCalledTimes(3)
    for (const previous of [
      { ...configured, name: "Old name" },
      { ...configured, archived: true },
    ]) {
      const changed = harness({ templates: [definition] }, [], [previous])
      vi.spyOn(changed.service, "revision").mockResolvedValue(previous)
      expect(await changed.service.synchronize(changed.context)).toEqual({
        changed: 1,
      })
      expect(changed.execute.mock.calls[2][1]).toEqual([
        definition.name,
        4,
        configured.id,
      ])
      expect(changed.execute.mock.calls[3][1][2]).toBe(4)
    }
  })

  test("archives removed configuration and rejects collisions with Admin-owned keys", async () => {
    const removed = harness({}, [], [{ id: "pat_removed", key: "removed" }])
    expect(await removed.service.synchronize(removed.context)).toEqual({
      changed: 1,
    })
    expect(removed.execute.mock.calls[2][1]).toEqual(["pat_removed"])
    const collision = harness({ templates: [definition] }, [], [revision])
    await expect(
      collision.service.synchronize(collision.context)
    ).rejects.toThrow("belongs to an Admin-managed template")
    expect(collision.execute).toHaveBeenCalledTimes(2)
  })
})
