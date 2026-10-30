import { MedusaError } from "@medusajs/framework/utils"
import { describe, expect, test, vi } from "vitest"
import ProductAttributesService from "../../src/modules/product-attributes/service"
import type {
  OwnedSpecification,
  SpecificationWriteInput,
  SpecificationWriteReceipt,
  TemplateRevision,
} from "../../src/types"

const template: TemplateRevision = {
  id: "pat_switch",
  key: "switch",
  name: "Switch",
  version: 3,
  source: "admin",
  archived: false,
  description: "",
  category_ids: [],
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
    {
      key: "voltage",
      label: "Voltage",
      type: "number",
      scope: "variant",
      required: false,
      searchable: false,
      filterable: true,
      comparable: true,
    },
  ],
}
const specification: OwnedSpecification = {
  id: "pspec_switch",
  product_id: "prod_switch",
  template_id: template.id,
  template_version: 3,
  version: 7,
  revision_id: "psrev_seven",
  values: { ports: 24 },
  variants: { variant_live: { voltage: 0 } },
  linked: true,
}
const input = (
  changes: Partial<SpecificationWriteInput> = {}
): SpecificationWriteInput => ({
  product_id: "prod_switch",
  template_id: template.id,
  template_version: 3,
  expected_version: 7,
  values: { ports: 24 },
  variants: { variant_live: { voltage: 0 } },
  actor_id: "user_editor",
  complete: true,
  ...changes,
})
function harness() {
  const execute = vi.fn().mockResolvedValue([])
  // Keep the actual public Medusa factory and decorators, replacing only the DB port.
  const service = new ProductAttributesService({})
  const manager = { execute }
  const context = { manager, transactionManager: manager } as any
  return { service, manager, execute, context }
}
function writable(before: OwnedSpecification | null = specification) {
  const h = harness()
  vi.spyOn(h.service, "specification").mockResolvedValue(before)
  vi.spyOn(h.service, "revision").mockResolvedValue(template)
  return h
}

describe("owned specification snapshots", () => {
  test("reads one immutable current snapshot and hides provisional first assignments", async () => {
    const h = harness()
    h.execute
      .mockResolvedValueOnce([specification])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...specification, linked: false }])
    expect(
      await h.service.specification("prod_switch", undefined, h.context)
    ).toEqual(specification)
    expect(h.execute.mock.calls[0][0]).toContain("r.id=s.current_revision_id")
    expect(h.execute.mock.calls[0][0]).toContain("s.linked=true")
    expect(
      await h.service.specification("missing", false, {
        manager: h.manager,
      } as any)
    ).toBeNull()
    expect(
      await h.service.specification("prod_switch", true, h.context)
    ).toEqual({ ...specification, linked: false })
    expect(h.execute.mock.calls[2][0]).not.toContain("s.linked=true")
    expect(h.execute.mock.calls[2][1]).toEqual(["prod_switch"])
  })

  test("creates a provisional aggregate, whole immutable revision and native variant references", async () => {
    const h = writable(null)
    const requested = input({ expected_version: 0 })
    const receipt = await h.service.writeSpecification(requested, h.context)
    expect(receipt.before).toBeNull()
    expect(receipt.after).toEqual({
      id: expect.stringMatching(/^pspec_/),
      product_id: requested.product_id,
      template_id: template.id,
      template_version: 3,
      version: 1,
      revision_id: expect.stringMatching(/^psrev_/),
      values: requested.values,
      variants: requested.variants,
      linked: false,
    })
    expect(receipt.created_variants).toEqual([
      { id: expect.stringMatching(/^psvar_/), variant_id: "variant_live" },
    ])
    expect(h.execute.mock.calls[0][0]).toContain("pg_advisory_xact_lock")
    const written = h.execute.mock.calls[2][1]
    expect(written.slice(0, 5)).toEqual([
      receipt.after.revision_id,
      receipt.after.id,
      template.id,
      3,
      1,
    ])
    expect(JSON.parse(written[5])).toEqual({ ports: 24 })
    expect(JSON.parse(written[6])).toEqual({ variant_live: { voltage: 0 } })
    expect(written[7]).toBe("user_editor")
    expect(h.execute.mock.calls[3][1]).toEqual([
      template.id,
      3,
      1,
      receipt.after.revision_id,
      receipt.after.id,
    ])
  })

  test("appends existing revisions while retaining stable native variant references", async () => {
    const h = writable()
    h.execute.mockImplementation(async (sql: string) =>
      sql.startsWith("select id,specification_id")
        ? [{ id: "psvar_existing", specification_id: specification.id }]
        : []
    )
    const receipt = await h.service.writeSpecification(
      input({ values: { ports: 48 } }),
      h.context
    )
    expect(receipt.before).toEqual(specification)
    expect(receipt.after).toEqual({
      ...specification,
      values: { ports: 48 },
      version: 8,
      revision_id: expect.stringMatching(/^psrev_/),
    })
    expect(receipt.created_variants).toEqual([])
    expect(
      h.execute.mock.calls.some(([sql]) =>
        sql.startsWith("insert into product_specification(")
      )
    ).toBe(false)
    expect(
      h.execute.mock.calls.some(([sql]) =>
        sql.startsWith("update product_specification_revision")
      )
    ).toBe(false)
  })

  test("rejects stale or provisional heads before creating any value revision", async () => {
    for (const before of [
      null,
      { ...specification, linked: false },
      { ...specification, version: 8 },
    ]) {
      const h = writable(before)
      await expect(
        h.service.writeSpecification(input(), h.context)
      ).rejects.toMatchObject({ type: MedusaError.Types.CONFLICT })
      expect(h.execute).toHaveBeenCalledTimes(1)
    }
  })

  test("validates pinned schema types and complete publication while allowing partial drafts", async () => {
    for (const requested of [
      input({ values: { ports: "twenty" } }),
      input({ values: {} }),
      input({ variants: { variant_live: { voltage: "wrong" } } }),
    ]) {
      const h = writable()
      await expect(
        h.service.writeSpecification(requested, h.context)
      ).rejects.toMatchObject({ type: MedusaError.Types.INVALID_DATA })
      expect(h.execute).toHaveBeenCalledTimes(1)
    }
    const draft = writable()
    expect(
      (
        await draft.service.writeSpecification(
          input({ values: {}, complete: false, variants: {} }),
          draft.context
        )
      ).after.values
    ).toEqual({})
  })

  test("retains an existing archived pin but cannot newly adopt an archived template", async () => {
    const retained = writable()
    vi.mocked(retained.service.revision).mockResolvedValue({
      ...template,
      archived: true,
    })
    expect(
      (
        await retained.service.writeSpecification(
          input({ variants: {} }),
          retained.context
        )
      ).after.template_version
    ).toBe(3)
    for (const before of [
      null,
      { ...specification, template_id: "other" },
      { ...specification, template_version: 2 },
    ]) {
      const denied = writable(before)
      vi.mocked(denied.service.revision).mockResolvedValue({
        ...template,
        archived: true,
      })
      await expect(
        denied.service.writeSpecification(
          input({ expected_version: before?.version || 0 }),
          denied.context
        )
      ).rejects.toThrow("Archived templates cannot be assigned")
    }
  })

  test("refuses to attach a native variant owned by another specification", async () => {
    const h = writable()
    h.execute.mockImplementation(async (sql: string) =>
      sql.startsWith("select id,specification_id")
        ? [{ id: "psvar_other", specification_id: "pspec_other" }]
        : []
    )
    await expect(
      h.service.writeSpecification(input(), h.context)
    ).rejects.toThrow("another specification")
    expect(
      h.execute.mock.calls.some(([sql]) =>
        sql.startsWith("insert into product_specification_variant")
      )
    ).toBe(false)
  })

  test("makes a first head visible only after its native links are confirmed", async () => {
    const h = writable({ ...specification, linked: false })
    await h.service.confirmSpecification(
      specification.product_id,
      specification.revision_id,
      h.context
    )
    expect(h.execute.mock.calls[1][1]).toEqual([specification.id])
    for (const before of [
      null,
      { ...specification, revision_id: "psrev_newer" },
    ]) {
      const stale = writable(before)
      await expect(
        stale.service.confirmSpecification(
          specification.product_id,
          specification.revision_id,
          stale.context
        )
      ).rejects.toMatchObject({ type: MedusaError.Types.CONFLICT })
      expect(stale.execute).toHaveBeenCalledTimes(1)
    }
  })

  test("compensates with a monotonic immutable revision and supports an identical retry", async () => {
    const after = {
      ...specification,
      version: 8,
      revision_id: "psrev_eight",
      values: { ports: 48 },
    }
    const receipt: SpecificationWriteReceipt = {
      before: specification,
      after,
      created_variants: [{ id: "psvar_created", variant_id: "variant_added" }],
    }
    const h = writable(after)
    await h.service.restoreSpecification(receipt, h.context)
    const written = h.execute.mock.calls[1]
    expect(written[0]).toContain("'system:compensation'")
    expect(written[1].slice(0, 5)).toEqual([
      "psrev_restore_psrev_eight",
      specification.id,
      template.id,
      3,
      9,
    ])
    expect(JSON.parse(written[1][5])).toEqual(specification.values)
    expect(JSON.parse(written[1][6])).toEqual(specification.variants)
    expect(h.execute.mock.calls[2][1]).toEqual([
      template.id,
      3,
      9,
      "psrev_restore_psrev_eight",
      specification.id,
    ])
    expect(h.execute.mock.calls[3][1]).toEqual(["psvar_created"])
    vi.mocked(h.service.specification).mockResolvedValue({
      ...specification,
      version: 9,
      revision_id: "psrev_restore_psrev_eight",
    })
    h.execute.mockClear()
    await h.service.restoreSpecification(receipt, h.context)
    expect(h.execute).toHaveBeenCalledTimes(1)
  })

  test("removes an initial failed aggregate and never overwrites a later head", async () => {
    const receipt: SpecificationWriteReceipt = {
      before: null,
      after: specification,
      created_variants: [],
    }
    const h = writable()
    await h.service.restoreSpecification(receipt, h.context)
    expect(h.execute.mock.calls.slice(1).map(([sql]) => sql)).toEqual([
      expect.stringMatching(
        /^update product_specification set current_revision_id=null/
      ),
      expect.stringMatching(/^delete from product_specification_revision/),
      expect.stringMatching(/^delete from product_specification_variant/),
      expect.stringMatching(/^delete from product_specification where/),
    ])
    const absent = writable(null)
    await absent.service.restoreSpecification(receipt, absent.context)
    expect(absent.execute).toHaveBeenCalledTimes(1)
    for (const current of [
      null,
      { ...specification, revision_id: "psrev_later", version: 9 },
      { ...specification, revision_id: "psrev_different_same_version" },
    ]) {
      const stale = writable(current)
      await expect(
        stale.service.restoreSpecification(
          { ...receipt, before: specification },
          stale.context
        )
      ).rejects.toMatchObject({ type: MedusaError.Types.CONFLICT })
      expect(stale.execute).toHaveBeenCalledTimes(1)
    }
  })
})
