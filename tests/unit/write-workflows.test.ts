import { describe, expect, it, vi } from "vitest"
import { harness, template } from "../helpers/backend"
const runtime = vi.hoisted(() => ({
  run: vi.fn().mockResolvedValue({}),
  productRun: vi.fn().mockResolvedValue({}),
  variantRun: vi.fn().mockResolvedValue({}),
  builder: undefined as unknown,
  plan: {} as any,
  receipt: {} as any,
}))
vi.mock("@medusajs/medusa/core-flows", () => ({
  createRemoteLinkStep: vi.fn((input) => input),
  updateProductsWorkflow: () => ({ run: runtime.productRun }),
  updateProductVariantsWorkflow: () => ({ run: runtime.variantRun }),
}))
vi.mock("@medusajs/framework/workflows-sdk", async (original) => {
  const sdk =
    await original<typeof import("@medusajs/framework/workflows-sdk")>()
  return {
    ...sdk,
    createStep: (name: string) => (input: any) =>
      name === "prepare-product-specification"
        ? runtime.plan
        : name === "write-owned-product-specification"
          ? runtime.receipt
          : input.product_id,
    createWorkflow: (_name: string, builder: unknown) => {
      runtime.builder = builder
      return () => ({ run: runtime.run })
    },
    transform: (input: unknown, handler: (input: unknown) => unknown) =>
      handler(input),
  }
})
import {
  prepareAttributesMutation,
  writeSpecification,
  restoreSpecification,
  specificationLinks,
  createSpecificationLinks,
  dismissSpecificationLinks,
  confirmationInput,
  confirmSpecification,
  mutateProductAttributes,
  exportProductAttributesMetadata,
} from "../../src/workflows/write"
const version = "psrev_1"
describe("owned immutable write orchestration", () => {
  it("plans explicit first assignment without mutating native records", async () => {
    const h = harness(false)
    const plan = (
      await prepareAttributesMutation(
        {
          product_id: h.product.id,
          assignment: {
            version: "unassigned",
            groups: [{ template_id: template.id, template_version: 1 }],
          },
        },
        h
      )
    ).output
    expect(plan).toMatchObject({
      expected_version: 0,
      values: {},
      variants: { variant_test: {} },
      complete: false,
      actor_id: "system:workflow",
    })
    expect(h.product.metadata).toEqual({ merchant_key: "preserved" })
    runtime.plan = plan
    runtime.receipt = await h.service.writeSpecification()
    expect(
      (runtime.builder as (input: unknown) => unknown)({
        product_id: h.product.id,
      })
    ).toBeDefined()
    expect(
      specificationLinks({
        receipt: {
          ...runtime.receipt,
          before: null,
          created_variants: [{ id: "psvar", variant_id: "variant_test" }],
        },
      })
    ).toEqual([
      {
        product: { product_id: h.product.id },
        product_attributes: { product_specification_id: "pspec_test" },
      },
      {
        product: { product_variant_id: "variant_test" },
        product_attributes: { product_specification_variant_id: "psvar" },
      },
    ])
    expect(specificationLinks({ receipt: runtime.receipt })).toEqual([
      {
        product: { product_id: h.product.id },
        product_attributes: { product_specification_id: "pspec_test" },
      },
    ])
  })
  it("initializes a complete published specification atomically and checks both parent versions before writes", async () => {
    const h = harness(false)
    h.product.status = "published"
    const combined = {
      product_id: h.product.id,
      assignment: {
        version: "unassigned",
        groups: [{ template_id: template.id, template_version: 1 }],
      },
      values: {
        version: "unassigned",
        values: { model: "Complete first snapshot" },
        variants: [
          { id: "variant_test", version: "unassigned", values: { ports: 0 } },
        ],
      },
    }
    expect((await prepareAttributesMutation(combined, h)).output).toMatchObject(
      {
        expected_version: 0,
        complete: true,
        values: { model: "Complete first snapshot" },
        variants: { variant_test: { ports: 0 } },
      }
    )
    await expect(
      prepareAttributesMutation(
        {
          ...combined,
          assignment: { ...combined.assignment, version: "stale" },
        },
        h
      )
    ).rejects.toThrow("record changed")
    await expect(
      prepareAttributesMutation(
        { ...combined, values: { ...combined.values, version: "stale" } },
        h
      )
    ).rejects.toThrow("record changed")
    await expect(
      prepareAttributesMutation(
        {
          ...combined,
          values: {
            ...combined.values,
            variants: [
              { id: "variant_test", version: "stale", values: { ports: 0 } },
            ],
          },
        },
        h
      )
    ).rejects.toThrow("record changed")
    expect(h.service.writeSpecification).not.toHaveBeenCalled()
  })
  it("merges only provided scopes and retains explicit zero/false/clear operations", async () => {
    const h = harness()
    const plan = (
      await prepareAttributesMutation(
        {
          product_id: h.product.id,
          actor_id: "user_editor",
          values: {
            version,
            values: { model: null },
            variants: [{ id: "variant_test", version, values: { ports: 0 } }],
          },
        },
        h
      )
    ).output
    expect(plan).toMatchObject({
      values: {},
      variants: { variant_test: { ports: 0 } },
      actor_id: "user_editor",
      expected_version: 1,
    })
    expect(
      (
        await prepareAttributesMutation(
          {
            product_id: h.product.id,
            values: {
              version,
              variants: [{ id: "variant_test", version, values: { ports: 9 } }],
            },
          },
          h
        )
      ).output.values
    ).toEqual({ model: "Example" })
    h.specification!.variants = {}
    expect(
      (
        await prepareAttributesMutation(
          { product_id: h.product.id, values: { version } },
          h
        )
      ).output.variants
    ).toEqual({ variant_test: {} })
    h.product.variants = undefined
    expect(
      (
        await prepareAttributesMutation(
          { product_id: h.product.id, values: { version } },
          h
        )
      ).output.variants
    ).toEqual({})
  })
  it("rejects stale head, stale variant, duplicates, foreign IDs and invalid scopes", async () => {
    const h = harness()
    await expect(
      prepareAttributesMutation(
        { product_id: h.product.id, values: { version: "stale" } },
        h
      )
    ).rejects.toThrow("record changed")
    await expect(
      prepareAttributesMutation(
        {
          product_id: h.product.id,
          values: {
            version,
            variants: [{ id: "variant_test", version: "stale", values: {} }],
          },
        },
        h
      )
    ).rejects.toThrow("record changed")
    await expect(
      prepareAttributesMutation(
        {
          product_id: h.product.id,
          values: {
            version,
            variants: [{ id: "foreign", version, values: {} }],
          },
        },
        h
      )
    ).rejects.toThrow("does not belong")
    const patch = { id: "variant_test", version, values: {} }
    await expect(
      prepareAttributesMutation(
        {
          product_id: h.product.id,
          values: { version, variants: [patch, patch] },
        },
        h
      )
    ).rejects.toThrow("unique")
    await expect(
      prepareAttributesMutation(
        {
          product_id: h.product.id,
          values: { version, values: { model: 42 } },
        },
        h
      )
    ).rejects.toThrow("Enter text")
    h.product.status = "published"
    await expect(
      prepareAttributesMutation(
        {
          product_id: h.product.id,
          values: { version, values: { model: " " } },
        },
        h
      )
    ).rejects.toThrow("required")
  })
  it("rejects missing or archived assignment and incompatible published adoption", async () => {
    const h = harness(false)
    await expect(
      prepareAttributesMutation(
        { product_id: h.product.id, values: { version: "unassigned" } },
        h
      )
    ).rejects.toThrow("Assign specification groups")
    h.service.revision.mockResolvedValue({ ...template, archived: true })
    await expect(
      prepareAttributesMutation(
        {
          product_id: h.product.id,
          assignment: {
            version: "unassigned",
            groups: [{ template_id: template.id, template_version: 1 }],
          },
        },
        h
      )
    ).rejects.toThrow("Archived")
    const assigned = harness()
    assigned.product.status = "published"
    assigned.service.revision.mockResolvedValue({
      ...template,
      version: 2,
      fields: template.fields.map((field) =>
        field.key === "ports" ? { ...field, min: 16 } : field
      ),
    })
    await expect(
      prepareAttributesMutation(
        {
          product_id: assigned.product.id,
          assignment: {
            version,
            groups: [{ template_id: template.id, template_version: 2 }],
          },
        },
        assigned
      )
    ).rejects.toThrow("outside the allowed range")
  })
  it("writes an atomic owned snapshot, confirms links, compensates and serializes callers", async () => {
    const h = harness()
    const plan = (
      await prepareAttributesMutation(
        { product_id: h.product.id, values: { version } },
        h
      )
    ).output
    const receipt = await writeSpecification(plan, h)
    expect(h.service.writeSpecification).toHaveBeenCalledWith(plan)
    expect(specificationLinks({ receipt: receipt.output })).toEqual([])
    expect(confirmationInput({ receipt: receipt.output })).toEqual(
      receipt.output.after
    )
    expect((await confirmSpecification(receipt.output.after, h)).output).toBe(
      h.product.id
    )
    expect(h.service.confirmSpecification).toHaveBeenCalledWith(
      h.product.id,
      "psrev_2"
    )
    await restoreSpecification(receipt.compensateInput, h)
    await restoreSpecification(undefined, h)
    expect(h.service.restoreSpecification).toHaveBeenCalledOnce()
    h.product.status = "published"
    h.product.variants.push({ id: "new", title: "New" })
    await expect(confirmSpecification(receipt.output.after, h)).rejects.toThrow(
      "required"
    )
    h.product.variants = []
    const mutation = { product_id: h.product.id, values: { version } }
    expect(
      (await mutateProductAttributes(h.container, mutation)).can_write
    ).toBe(true)
    expect(runtime.run).toHaveBeenCalledWith({
      input: { ...mutation, actor_id: "system:workflow" },
    })
    expect(h.locking.execute).toHaveBeenCalledWith(
      `product-attributes:${h.product.id}`,
      expect.any(Function),
      { timeout: 10 }
    )
    expect(
      (
        await mutateProductAttributes(
          h.container,
          mutation,
          false,
          "user_editor"
        )
      ).can_write
    ).toBe(false)
  })
  it("compensates public links even when creation fails after a partial write", async () => {
    const h = harness()
    const links = specificationLinks({
      receipt: { ...(await h.service.writeSpecification()), before: null },
    })
    expect((await createSpecificationLinks(links, h)).output).toEqual(links)
    expect(h.link.create).toHaveBeenCalledWith(links)
    await createSpecificationLinks([], h)
    expect(h.link.create).toHaveBeenCalledOnce()
    h.link.create.mockRejectedValueOnce(new Error("Native link unavailable"))
    await expect(createSpecificationLinks(links, h)).rejects.toThrow(
      "Native link unavailable"
    )
    h.link.create.mockRejectedValueOnce("offline")
    await expect(createSpecificationLinks(links, h)).rejects.toThrow(
      "Unable to link product specifications"
    )
    await dismissSpecificationLinks(links, h)
    await dismissSpecificationLinks([], h)
    await dismissSpecificationLinks(undefined, h)
    expect(h.link.dismiss).toHaveBeenCalledOnce()
  })
  it("exports only explicit one-way snapshots and leaves authority untouched on export failures", async () => {
    const h = harness()
    expect(
      await exportProductAttributesMetadata(h.container, h.product.id, version)
    ).toEqual({ revision_id: version })
    expect(runtime.productRun).toHaveBeenCalledWith({
      input: {
        products: [
          {
            id: h.product.id,
            metadata: {
              product_attributes: {
                revision_id: version,
                groups: [{ template_id: template.id, template_version: 1 }],
                values: { model: "Example" },
              },
            },
          },
        ],
      },
    })
    expect(runtime.variantRun).toHaveBeenCalledWith({
      input: {
        product_variants: [
          {
            id: "variant_test",
            metadata: {
              product_attributes: {
                revision_id: version,
                values: { ports: 8 },
              },
            },
          },
        ],
      },
    })
    h.specification!.variants = {}
    await exportProductAttributesMetadata(h.container, h.product.id, version)
    h.product.variants = undefined
    await exportProductAttributesMetadata(h.container, h.product.id, version)
    await expect(
      exportProductAttributesMetadata(h.container, h.product.id, "stale")
    ).rejects.toThrow("record changed")
    runtime.productRun.mockRejectedValueOnce(new Error("Export unavailable"))
    await expect(
      exportProductAttributesMetadata(h.container, h.product.id, version)
    ).rejects.toThrow("Export unavailable")
    expect(h.service.writeSpecification).not.toHaveBeenCalled()
    expect(h.specification!.values).toEqual({ model: "Example" })
    const missing = harness(false)
    await expect(
      exportProductAttributesMetadata(
        missing.container,
        missing.product.id,
        "unassigned"
      )
    ).rejects.toThrow("Assign specification groups")
    h.service.specification.mockResolvedValue(null)
    await expect(
      exportProductAttributesMetadata(h.container, h.product.id, version)
    ).rejects.toThrow("Assign specification groups")
  })
})

it("composes reusable groups, rejects duplicate group and field assignments and removes only detached facts", async () => {
  const h = harness()
  const power = {
    ...template,
    id: "pat_power",
    key: "power",
    fields: [
      {
        ...template.fields[0],
        key: "power_w",
        type: "number" as const,
        required: false,
      },
    ],
  }
  h.service.revision.mockImplementation(async (id: string) =>
    id === power.id ? power : template
  )
  const group = { template_id: template.id, template_version: 1 }
  const extra = { template_id: power.id, template_version: 1 }
  const prepared = await prepareAttributesMutation(
    {
      product_id: h.product.id,
      assignment: { version, groups: [group, extra] },
      values: { version, values: { power_w: 9 } },
    },
    h
  )
  expect(prepared.output.groups).toEqual([group, extra])
  expect(prepared.output.values).toEqual({ model: "Example", power_w: 9 })
  await expect(
    prepareAttributesMutation(
      {
        product_id: h.product.id,
        assignment: { version, groups: [group, group] },
      },
      h
    )
  ).rejects.toThrow("only once")
  h.service.revision.mockResolvedValue(template)
  await expect(
    prepareAttributesMutation(
      {
        product_id: h.product.id,
        assignment: { version, groups: [group, extra] },
      },
      h
    )
  ).rejects.toThrow("duplicate field")
  const removed = await prepareAttributesMutation(
    { product_id: h.product.id, assignment: { version, groups: [] } },
    h
  )
  expect(removed.output.values).toEqual({})
  expect(removed.output.variants).toEqual({ variant_test: {} })
})

it("rejects new archived groups and excessive compositions before preparing values", async () => {
  const h = harness(false)
  h.service.revision.mockResolvedValue({ ...template, archived: true })
  await expect(
    prepareAttributesMutation(
      {
        product_id: h.product.id,
        assignment: {
          version: "unassigned",
          groups: [{ template_id: template.id, template_version: 1 }],
        },
      },
      h
    )
  ).rejects.toThrow("Archived groups")
  const existing = harness()
  existing.service.revision.mockResolvedValue({
    ...template,
    id: "another",
    archived: true,
  })
  await expect(
    prepareAttributesMutation(
      {
        product_id: existing.product.id,
        assignment: {
          version,
          groups: [{ template_id: "another", template_version: 1 }],
        },
      },
      existing
    )
  ).rejects.toThrow("Archived groups")
  await expect(
    prepareAttributesMutation(
      {
        product_id: existing.product.id,
        assignment: {
          version,
          groups: Array.from({ length: 31 }, (_, i) => ({
            template_id: String(i),
            template_version: 1,
          })),
        },
      },
      existing
    )
  ).rejects.toThrow("maximum 30")
})

it("does not treat another revision of an archived group as an existing pin", async () => {
  const h = harness()
  h.service.revision.mockResolvedValue({
    ...template,
    version: 2,
    archived: true,
  })
  await expect(
    prepareAttributesMutation(
      {
        product_id: h.product.id,
        assignment: {
          version,
          groups: [{ template_id: template.id, template_version: 2 }],
        },
      },
      h
    )
  ).rejects.toThrow("Archived groups")
})
