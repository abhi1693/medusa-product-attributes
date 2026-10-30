import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { PRODUCT_ATTRIBUTES } from "../../src/constants"
import { allowed, authorize } from "../../src/api/authorization"
import middleware from "../../src/api/middlewares"
import { templateAssignments } from "../../src/api/template-assignments"
import {
  archiveTemplate,
  assignProduct,
  checkProduct,
  getProduct,
  getTemplate,
  listTemplates,
  saveProductValues,
  saveTemplate,
  storeProduct,
} from "../../src/api/handlers"
import {
  metadataMutation,
  protectNativeProductWrites,
} from "../../src/api/native-guard"

const workflows = vi.hoisted(() => ({
  productView: vi.fn(),
  productState: vi.fn(),
  productIssues: vi.fn(),
  validateProduct: vi.fn(),
  variantEnvelope: vi.fn(),
  enforceProduct: vi.fn(),
  mutateProductAttributes: vi.fn(),
}))
vi.mock("../../src/workflows/read", () => workflows)
vi.mock("../../src/workflows/write", () => workflows)

const definition = {
  key: "network_switch",
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
const revision = {
  ...definition,
  description: "",
  category_ids: [],
  id: "tpl_switch",
  version: 2,
  source: "admin",
  archived: false,
}

function fixture(overrides: Record<string, unknown> = {}) {
  const service = {
    configuration: { metadata_key: "specifications" } as {
      metadata_key: string
      authorize?: (request: unknown, context: unknown) => Promise<boolean>
    },
    page: vi.fn().mockResolvedValue({ templates: [revision], count: 1 }),
    revision: vi.fn().mockResolvedValue(revision),
    history: vi.fn().mockResolvedValue([revision]),
    save: vi.fn().mockResolvedValue(revision),
    archive: vi.fn().mockResolvedValue({ ...revision, archived: true }),
    listAndCountProductTemplateAssignments: vi.fn().mockResolvedValue([[], 0]),
    binding: vi.fn().mockResolvedValue({ template_id: revision.id }),
  }
  const products = {
    retrieveProduct: vi.fn().mockResolvedValue({
      id: "prod_switch",
      status: "published",
    }),
  }
  const query = { graph: vi.fn().mockResolvedValue({ data: [{}] }) }
  const resolve = vi.fn((key: string) => {
    if (key === PRODUCT_ATTRIBUTES) return service
    if (key === Modules.PRODUCT) return products
    if (key === ContainerRegistrationKeys.QUERY) return query
    throw new Error(`Unexpected module ${key}`)
  })
  const request = {
    auth_context: { actor_id: "user_admin", actor_type: "user" },
    params: { id: "prod_switch" },
    query: {},
    body: {},
    path: "/admin/products/prod_switch",
    scope: { resolve },
    publishable_key_context: { sales_channel_ids: ["sc_web"] },
    ...overrides,
  } as unknown as AuthenticatedMedusaRequest
  const response = { json: vi.fn() } as unknown as MedusaResponse
  return { request, response, service, products, query, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  workflows.productView.mockResolvedValue({ product_id: "prod_switch" })
  workflows.mutateProductAttributes.mockResolvedValue({
    product_id: "prod_switch",
  })
  workflows.validateProduct.mockResolvedValue([])
  workflows.productIssues.mockReturnValue([])
  workflows.productState.mockResolvedValue({
    namespace: "specifications",
    template: revision,
    stored: { values: { ports: 24 } },
    product: {
      id: "prod_switch",
      status: "published",
      variants: [
        { id: "variant_24", metadata: { specifications: { ports: 24 } } },
        { id: "variant_48", metadata: null },
      ],
    },
  })
  workflows.variantEnvelope.mockImplementation((metadata) =>
    metadata ? { values: { ports: 24 } } : null
  )
})

describe("Admin authorization", () => {
  test("requires an authenticated native user before any adapter or data access", async () => {
    const { request, service, resolve } = fixture({ auth_context: undefined })
    await expect(allowed(request, { action: "templates.read" })).resolves.toBe(
      false
    )
    await expect(
      authorize(request, { action: "templates.read" })
    ).rejects.toMatchObject({ type: MedusaError.Types.UNAUTHORIZED })
    expect(resolve).not.toHaveBeenCalled()
    for (const actor_type of ["customer", "custom_actor"]) {
      request.auth_context = { actor_id: "actor_external", actor_type } as any
      service.configuration.authorize = vi.fn().mockResolvedValue(true)
      await expect(
        authorize(request, {
          action: "values.write",
          product_id: "prod_switch",
        })
      ).rejects.toMatchObject({ type: MedusaError.Types.FORBIDDEN })
      expect(service.configuration.authorize).not.toHaveBeenCalled()
    }
  })

  test("works independently and passes trusted entity context to an optional adapter", async () => {
    const { request, service } = fixture()
    await expect(
      authorize(request, { action: "templates.read" })
    ).resolves.toBeUndefined()
    const adapter = vi.fn().mockResolvedValue(true)
    service.configuration.authorize = adapter
    const context = {
      action: "values.write",
      product_id: "prod_switch",
    } as const
    await expect(authorize(request, context)).resolves.toBeUndefined()
    expect(adapter).toHaveBeenCalledWith(request, context)
    adapter.mockResolvedValue(false)
    await expect(authorize(request, context)).rejects.toMatchObject({
      type: MedusaError.Types.FORBIDDEN,
    })
    adapter.mockRejectedValue(new Error("Authorization unavailable"))
    await expect(authorize(request, context)).rejects.toThrow(
      "Authorization unavailable"
    )
  })
})

describe("Admin template endpoints", () => {
  test("lists with bounded pagination and reports separate write permission", async () => {
    const { request, response, service } = fixture({
      query: {
        q: " switch ",
        limit: "20",
        offset: "5",
        include_archived: "true",
      },
    })
    service.configuration.authorize = vi
      .fn()
      .mockImplementation(
        async (_request, context: any) => context.action === "templates.read"
      )
    await listTemplates(request, response)
    expect(service.page).toHaveBeenCalledWith({
      q: "switch",
      limit: 20,
      offset: 5,
      include_archived: true,
    })
    expect(response.json).toHaveBeenCalledWith({
      templates: [revision],
      count: 1,
      can_write: false,
    })
    request.query = {}
    await listTemplates(request, response)
    expect(service.page).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 0,
      include_archived: false,
    })
    for (const query of [
      { offset: "-1" },
      { limit: "101" },
      { limit: "1.5" },
      { include_archived: "yes" },
      { q: "x".repeat(101) },
      { unexpected: "value" },
    ]) {
      request.query = query
      await expect(listTemplates(request, response)).rejects.toMatchObject({
        type: MedusaError.Types.INVALID_DATA,
      })
    }
  })

  test("returns a template with immutable history and entity-scoped access", async () => {
    const { request, response, service } = fixture({
      params: { id: revision.id },
    })
    service.configuration.authorize = vi.fn().mockResolvedValue(true)
    await getTemplate(request, response)
    expect(service.revision).toHaveBeenCalledWith(revision.id)
    expect(service.history).toHaveBeenCalledWith(revision.id)
    expect(service.configuration.authorize).toHaveBeenCalledWith(request, {
      action: "templates.read",
      template_id: revision.id,
    })
    expect(response.json).toHaveBeenCalledWith({
      template: revision,
      revisions: [revision],
      can_write: true,
    })
  })

  test("creates and revises through the owning service with optimistic revision checks", async () => {
    const { request, response, service } = fixture({
      params: {},
      body: definition,
    })
    await saveTemplate(request, response)
    expect(service.save).toHaveBeenCalledWith(
      { ...definition, description: "", category_ids: [] },
      "user_admin",
      undefined,
      undefined
    )
    request.params = { id: revision.id }
    request.body = { ...definition, version: 2 }
    await saveTemplate(request, response)
    expect(service.save).toHaveBeenLastCalledWith(
      { ...definition, description: "", category_ids: [] },
      "user_admin",
      revision.id,
      2
    )
    expect(response.json).toHaveBeenCalledWith({
      template: revision,
      revisions: [revision],
      can_write: true,
    })
    const conflict = new MedusaError(
      MedusaError.Types.CONFLICT,
      "Stale revision"
    )
    service.save.mockRejectedValue(conflict)
    await expect(saveTemplate(request, response)).rejects.toBe(conflict)
  })

  test("rejects malformed or unversioned edits before saving or archiving", async () => {
    const { request, response, service } = fixture({
      params: { id: revision.id },
    })
    for (const body of [
      null,
      [],
      "template",
      definition,
      { ...definition, version: 0 },
      { ...definition, version: 1, injected: true },
    ]) {
      request.body = body
      await expect(saveTemplate(request, response)).rejects.toMatchObject({
        type: MedusaError.Types.INVALID_DATA,
      })
    }
    expect(service.save).not.toHaveBeenCalled()
    request.body = { version: 2 }
    await archiveTemplate(request, response)
    expect(service.archive).toHaveBeenCalledWith(revision.id, 2)
    expect(response.json).toHaveBeenCalledWith({
      template: { ...revision, archived: true },
      revisions: [revision],
      can_write: true,
    })
    request.body = { version: 2, force: true }
    await expect(archiveTemplate(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
    })
  })
})

describe("template assignment impact", () => {
  test("paginates owned assignments and hydrates only permitted live native products", async () => {
    const { request, response, service, query } = fixture({
      params: { id: revision.id },
      query: { offset: "20", limit: "10", outdated: "true" },
    })
    service.listAndCountProductTemplateAssignments.mockResolvedValue([
      [
        {
          id: "binding_visible",
          product_id: "prod_visible",
          template_version: 1,
        },
        {
          id: "binding_denied",
          product_id: "prod_denied",
          template_version: 1,
        },
        {
          id: "binding_deleted",
          product_id: "prod_deleted",
          template_version: 1,
        },
      ],
      45,
    ])
    service.configuration.authorize = vi
      .fn()
      .mockImplementation(
        async (_request, context: any) => context.product_id !== "prod_denied"
      )
    query.graph.mockResolvedValue({
      data: [
        {
          id: "prod_visible",
          title: "Visible switch",
          status: "published",
          metadata: { private_note: "Never return" },
        },
        { id: "prod_unrequested", title: "Unrequested", status: "draft" },
      ],
    })
    await templateAssignments(request, response)
    expect(service.listAndCountProductTemplateAssignments).toHaveBeenCalledWith(
      { template_id: revision.id, template_version: { $lt: 2 } },
      {
        skip: 20,
        take: 10,
        order: { id: "ASC" },
        select: ["id", "product_id", "template_version"],
      }
    )
    expect(query.graph).toHaveBeenCalledWith({
      entity: "product",
      fields: ["id", "title", "status"],
      filters: { id: ["prod_visible", "prod_deleted"] },
    })
    expect(service.configuration.authorize).toHaveBeenCalledWith(request, {
      action: "templates.read",
      template_id: revision.id,
    })
    expect(service.configuration.authorize).toHaveBeenCalledWith(request, {
      action: "values.read",
      template_id: revision.id,
      product_id: "prod_denied",
    })
    expect(response.json).toHaveBeenCalledWith({
      assignments: [
        {
          product: {
            id: "prod_visible",
            title: "Visible switch",
            status: "published",
          },
          template_version: 1,
        },
      ],
      current_version: 2,
      count: 45,
      offset: 20,
      limit: 10,
    })
  })

  test("keeps assignment counts and offsets explicit when products are inaccessible or absent", async () => {
    const { request, response, service, query } = fixture({
      params: { id: revision.id },
    })
    await templateAssignments(request, response)
    expect(service.listAndCountProductTemplateAssignments).toHaveBeenCalledWith(
      { template_id: revision.id },
      {
        skip: 0,
        take: 20,
        order: { id: "ASC" },
        select: ["id", "product_id", "template_version"],
      }
    )
    expect(response.json).toHaveBeenCalledWith({
      assignments: [],
      current_version: 2,
      count: 0,
      offset: 0,
      limit: 20,
    })
    service.listAndCountProductTemplateAssignments.mockResolvedValue([
      [
        {
          id: "binding_denied",
          product_id: "prod_denied",
          template_version: 2,
        },
      ],
      1,
    ])
    service.configuration.authorize = vi
      .fn()
      .mockImplementation(
        async (_request, context: any) => context.action === "templates.read"
      )
    request.query = { outdated: "false" }
    await templateAssignments(request, response)
    expect(response.json).toHaveBeenLastCalledWith({
      assignments: [],
      current_version: 2,
      count: 1,
      offset: 0,
      limit: 20,
    })
    expect(query.graph).not.toHaveBeenCalled()
  })

  test("rejects invalid filters, unauthenticated actors and denied template access before listing assignments", async () => {
    const { request, response, service } = fixture({
      params: { id: revision.id },
    })
    for (const query of [
      { offset: "-1" },
      { limit: "0" },
      { limit: "101" },
      { limit: "2.5" },
      { outdated: "yes" },
      { unexpected: "value" },
    ]) {
      request.query = query
      await expect(
        templateAssignments(request, response)
      ).rejects.toMatchObject({
        type: MedusaError.Types.INVALID_DATA,
      })
    }
    request.query = {}
    request.auth_context = undefined as any
    await expect(templateAssignments(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.UNAUTHORIZED,
    })
    request.auth_context = {
      actor_id: "user_denied",
      actor_type: "user",
    } as any
    service.configuration.authorize = vi.fn().mockResolvedValue(false)
    await expect(templateAssignments(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.FORBIDDEN,
    })
    expect(
      service.listAndCountProductTemplateAssignments
    ).not.toHaveBeenCalled()
    expect(response.json).not.toHaveBeenCalled()
  })

  test("fails closed when native hydration or a per-product policy cannot be evaluated", async () => {
    const { request, response, service, query } = fixture({
      params: { id: revision.id },
    })
    const missing = new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Template not found"
    )
    service.revision.mockRejectedValueOnce(missing)
    await expect(templateAssignments(request, response)).rejects.toBe(missing)
    service.listAndCountProductTemplateAssignments.mockResolvedValue([
      [
        {
          id: "binding_visible",
          product_id: "prod_visible",
          template_version: 1,
        },
      ],
      1,
    ])
    const unavailable = new Error("Native Query unavailable")
    query.graph.mockRejectedValueOnce(unavailable)
    await expect(templateAssignments(request, response)).rejects.toBe(
      unavailable
    )
    const denied = new Error("Policy unavailable")
    service.configuration.authorize = vi
      .fn()
      .mockImplementation(async (_request, context: any) => {
        if (context.product_id) throw denied
        return true
      })
    await expect(templateAssignments(request, response)).rejects.toBe(denied)
    expect(response.json).not.toHaveBeenCalled()
  })
})

describe("Admin product endpoints", () => {
  test("reads product values and validation with independent write permission", async () => {
    const { request, response, service } = fixture()
    service.configuration.authorize = vi
      .fn()
      .mockImplementation(
        async (_request, context: any) => context.action === "values.read"
      )
    await getProduct(request, response)
    expect(workflows.productView).toHaveBeenCalledWith(
      request.scope,
      "prod_switch",
      false
    )
    await checkProduct(request, response)
    expect(workflows.validateProduct).toHaveBeenCalledWith(
      request.scope,
      "prod_switch",
      true
    )
    expect(response.json).toHaveBeenLastCalledWith({ validation: [] })
    await expect(assignProduct(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.FORBIDDEN,
    })
    expect(workflows.mutateProductAttributes).not.toHaveBeenCalled()
  })

  test("round-trips opaque version tokens and typed product/variant values", async () => {
    const { request, response } = fixture({
      body: {
        version: "2026-10-30T00:00:00.000Z:7",
        template_id: revision.id,
        template_version: 2,
      },
    })
    await assignProduct(request, response)
    expect(workflows.mutateProductAttributes).toHaveBeenCalledWith(
      request.scope,
      {
        product_id: "prod_switch",
        assignment: request.body,
      }
    )
    request.body = {
      version: "native-stamp:8",
      values: {
        ports: 0,
        poe: false,
        title: "",
        colors: ["black"],
        clear: null,
      },
      variants: [{ id: "variant_24", version: "variant-stamp:3", values: {} }],
    }
    await saveProductValues(request, response)
    expect(workflows.mutateProductAttributes).toHaveBeenLastCalledWith(
      request.scope,
      { product_id: "prod_switch", values: request.body }
    )
    const conflict = new MedusaError(
      MedusaError.Types.CONFLICT,
      "Stale product"
    )
    workflows.mutateProductAttributes.mockRejectedValue(conflict)
    await expect(saveProductValues(request, response)).rejects.toBe(conflict)
  })

  test("rejects unsafe assignment and values payloads before native mutation", async () => {
    const { request, response } = fixture()
    for (const body of [
      null,
      { version: "", template_id: "tpl", template_version: 1 },
      { version: "stamp", template_id: "tpl", template_version: 0 },
      {
        version: "stamp",
        template_id: "tpl",
        template_version: 1,
        force: true,
      },
    ]) {
      request.body = body
      await expect(assignProduct(request, response)).rejects.toMatchObject({
        type: MedusaError.Types.INVALID_DATA,
      })
    }
    for (const body of [
      null,
      { version: "" },
      { version: "stamp", values: { "bad-key": "value" } },
      { version: "stamp", values: { nested: { secret: true } } },
      { version: "stamp", values: { ports: Infinity } },
      { version: "stamp", values: { colors: [1] } },
      { version: "stamp", variants: [{ id: "variant_24", values: {} }] },
      { version: "stamp", values: {}, extra: true },
    ]) {
      request.body = body
      await expect(saveProductValues(request, response)).rejects.toMatchObject({
        type: MedusaError.Types.INVALID_DATA,
      })
    }
    expect(workflows.mutateProductAttributes).not.toHaveBeenCalled()
  })
})

describe("Store visibility boundary", () => {
  const call = (
    request: AuthenticatedMedusaRequest,
    response: MedusaResponse
  ) => storeProduct(request as unknown as MedusaStoreRequest, response)

  test("returns only validated published attributes in the publishable key's channels", async () => {
    const { request, response, query, products } = fixture()
    await call(request, response)
    expect(workflows.productState).toHaveBeenCalledExactlyOnceWith(
      request.scope,
      "prod_switch"
    )
    expect(products.retrieveProduct).not.toHaveBeenCalled()
    expect(workflows.validateProduct).not.toHaveBeenCalled()
    const state = workflows.productState.mock.results[0].value
    const snapshot = await state
    expect(workflows.productIssues).toHaveBeenCalledWith(
      revision,
      snapshot.product,
      "specifications",
      true
    )
    expect(query.graph).toHaveBeenCalledWith({
      entity: "product_sales_channel",
      fields: ["product_id"],
      filters: { product_id: "prod_switch", sales_channel_id: ["sc_web"] },
    })
    expect(response.json).toHaveBeenCalledWith({
      product_id: "prod_switch",
      template: {
        key: revision.key,
        name: revision.name,
        version: revision.version,
        fields: revision.fields,
      },
      values: { ports: 24 },
      variants: [
        { id: "variant_24", values: { ports: 24 } },
        { id: "variant_48", values: {} },
      ],
    })
    expect(workflows.variantEnvelope).toHaveBeenCalledWith(
      null,
      "specifications"
    )
    workflows.productState.mockResolvedValue({
      ...snapshot,
      product: { id: "prod_switch", status: "published" },
    })
    await call(request, response)
    expect(response.json).toHaveBeenLastCalledWith(
      expect.objectContaining({ variants: [] })
    )
  })

  test("does not reveal missing, cross-channel, draft, unassigned or invalid products", async () => {
    const { request, response, query, products } = fixture()
    for (const context of [undefined, {}, { sales_channel_ids: [] }]) {
      ;(request as any).publishable_key_context = context
      await expect(call(request, response)).rejects.toMatchObject({
        type: MedusaError.Types.NOT_FOUND,
        message: "Product attributes not found",
      })
    }
    expect(query.graph).not.toHaveBeenCalled()
    ;(request as any).publishable_key_context = {
      sales_channel_ids: ["sc_web"],
    }
    query.graph.mockResolvedValueOnce({ data: [] })
    await expect(call(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
    })
    expect(workflows.productState).not.toHaveBeenCalled()
    workflows.productState.mockRejectedValueOnce(
      new MedusaError(MedusaError.Types.NOT_FOUND, "Native product missing")
    )
    await expect(call(request, response)).rejects.toMatchObject({
      message: "Product attributes not found",
    })
    const unavailable = new Error("Product service unavailable")
    workflows.productState.mockRejectedValueOnce(unavailable)
    await expect(call(request, response)).rejects.toBe(unavailable)
    const forbidden = new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "Internal policy"
    )
    workflows.productState.mockRejectedValueOnce(forbidden)
    await expect(call(request, response)).rejects.toBe(forbidden)
    workflows.productState.mockResolvedValueOnce({
      product: { id: "prod_switch", status: "draft" },
    })
    await expect(call(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
    })
    workflows.productState.mockResolvedValueOnce({
      product: { id: "prod_switch", status: "published" },
      template: null,
    })
    await expect(call(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
    })
    workflows.productIssues.mockReturnValueOnce([
      { path: "ports", code: "required", message: "Ports is required" },
    ])
    await expect(call(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
    })
    expect(response.json).not.toHaveBeenCalled()
    expect(products.retrieveProduct).not.toHaveBeenCalled()
  })

  test("withholds corrupted persisted envelopes and never mixes publication snapshots", async () => {
    const { request, response } = fixture()
    workflows.productState.mockRejectedValueOnce(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Protected binding mismatch"
      )
    )
    await expect(call(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
      message: "Product attributes not found",
    })
    workflows.variantEnvelope.mockImplementationOnce(() => {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Invalid variant envelope"
      )
    })
    await expect(call(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
      message: "Product attributes not found",
    })
    workflows.productState.mockClear()
    workflows.productState.mockResolvedValueOnce({
      product: { id: "prod_switch", status: "draft" },
      template: revision,
      stored: { values: { ports: 99 } },
    })
    await expect(call(request, response)).rejects.toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
    })
    expect(workflows.productState).toHaveBeenCalledOnce()
    expect(response.json).not.toHaveBeenCalled()
  })
})

describe("native product write protection", () => {
  test("recognizes namespace writes and destructive clearing throughout batch payloads", () => {
    for (const value of [null, true, 3, "value", [], {}, { metadata: {} }])
      expect(metadataMutation(value, "specifications")).toBeNull()
    expect(
      metadataMutation({ metadata: { unrelated: "kept" } }, "specifications")
    ).toBeNull()
    expect(
      metadataMutation(
        {
          update: [
            { title: "Switch" },
            { variants: [{ metadata: { specifications: null } }] },
          ],
        },
        "specifications"
      )
    ).toBe("reserved")
    expect(metadataMutation({ metadata: null }, "specifications")).toBe("clear")
    expect(metadataMutation([{ metadata: "" }], "specifications")).toBe("clear")
    expect(
      metadataMutation({ variants: [{ metadata: null }] }, "specifications")
    ).toBe("clear")
    expect(
      metadataMutation({ metadata: "unrelated" }, "specifications")
    ).toBeNull()
    for (const value of [
      [{ metadata: null }, { metadata: { specifications: {} } }],
      { metadata: null, variants: [{ metadata: { specifications: {} } }] },
    ])
      expect(metadataMutation(value, "specifications")).toBe("reserved")
  })

  test("blocks direct namespace replacement and clears without losing native lifecycle", async () => {
    const { request, response, service } = fixture({
      body: { variants: [{ metadata: { specifications: {} } }] },
    })
    const next = vi.fn()
    await expect(
      protectNativeProductWrites(request, response, next)
    ).rejects.toMatchObject({ type: MedusaError.Types.INVALID_DATA })
    expect(service.binding).not.toHaveBeenCalled()
    request.body = { metadata: null }
    await expect(
      protectNativeProductWrites(request, response, next)
    ).rejects.toMatchObject({ type: MedusaError.Types.INVALID_DATA })
    expect(next).not.toHaveBeenCalled()
    service.binding.mockResolvedValueOnce(null)
    await protectNativeProductWrites(request, response, next)
    expect(next).toHaveBeenCalledOnce()
    service.binding.mockClear().mockResolvedValue(null)
    request.body = {
      update: [
        { id: "prod_unassigned", metadata: null },
        { id: "prod_unassigned", metadata: { specifications: {} } },
      ],
    }
    next.mockClear()
    await expect(
      protectNativeProductWrites(request, response, next)
    ).rejects.toMatchObject({ type: MedusaError.Types.INVALID_DATA })
    expect(service.binding).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  test("enforces required attributes before direct and batch publication", async () => {
    const { request, response, service } = fixture({
      path: "/admin/Products/prod%2Fswitch",
      body: { status: "published", metadata: { merchant_note: "Preserve" } },
    })
    const next = vi.fn()
    await protectNativeProductWrites(request, response, next)
    expect(service.binding).toHaveBeenCalledWith("prod/switch")
    expect(workflows.enforceProduct).toHaveBeenCalledWith(
      request.scope,
      "prod/switch",
      true
    )
    Object.assign(request, { path: "/admin/products/batch" })
    request.body = {
      update: [
        null,
        { title: "No identifier" },
        { id: "prod_draft", status: "draft" },
        { id: "prod_switch", status: "published" },
        { id: "prod_switch", status: "published" },
      ],
    }
    workflows.enforceProduct.mockClear()
    await protectNativeProductWrites(request, response, next)
    expect(workflows.enforceProduct).toHaveBeenCalledExactlyOnceWith(
      request.scope,
      "prod_switch",
      true
    )
    workflows.enforceProduct.mockRejectedValueOnce(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Ports is required")
    )
    next.mockClear()
    await expect(
      protectNativeProductWrites(request, response, next)
    ).rejects.toThrow("Ports is required")
    expect(next).not.toHaveBeenCalled()
  })

  test("allows unrelated operations and rejects malformed encoded identifiers", async () => {
    const { request, response, service } = fixture()
    const next = vi.fn()
    for (const path of [
      "/admin/products",
      "/admin/products/import",
      "/admin/products/export",
      "/admin/products/export-fields",
      "/admin/product-variants/variant_24",
    ]) {
      Object.assign(request, { path })
      request.body = null
      await protectNativeProductWrites(request, response, next)
    }
    expect(service.binding).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(5)
    Object.assign(request, { path: "/admin/products/%invalid" })
    await expect(
      protectNativeProductWrites(request, response, next)
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: "Malformed product identifier",
    })
  })
})

test("public HTTP routes bind the supported Admin and Store handlers", async () => {
  const templates =
    await import("../../src/api/admin/product-attributes/templates/route.js")
  const template =
    await import("../../src/api/admin/product-attributes/templates/[id]/route.js")
  const archive =
    await import("../../src/api/admin/product-attributes/templates/[id]/archive/route.js")
  const product =
    await import("../../src/api/admin/product-attributes/products/[id]/route.js")
  const assignment =
    await import("../../src/api/admin/product-attributes/products/[id]/assignment/route.js")
  const values =
    await import("../../src/api/admin/product-attributes/products/[id]/values/route.js")
  const validation =
    await import("../../src/api/admin/product-attributes/products/[id]/validate/route.js")
  const store =
    await import("../../src/api/store/products/[id]/attributes/route.js")
  const impact =
    await import("../../src/api/admin/product-attributes/templates/[id]/products/route.js")
  expect(templates.GET).toBe(listTemplates)
  expect(templates.POST).toBe(saveTemplate)
  expect(template.GET).toBe(getTemplate)
  expect(template.POST).toBe(saveTemplate)
  expect(archive.POST).toBe(archiveTemplate)
  expect(product.GET).toBe(getProduct)
  expect(assignment.POST).toBe(assignProduct)
  expect(values.POST).toBe(saveProductValues)
  expect(validation.POST).toBe(checkProduct)
  expect(store.GET).toBe(storeProduct)
  expect(impact.GET).toBe(templateAssignments)
  expect(middleware.routes).toEqual([
    expect.objectContaining({
      matcher: expect.any(RegExp),
      methods: ["POST", "PUT", "PATCH"],
      middlewares: [protectNativeProductWrites],
    }),
  ])
  const matcher = middleware.routes![0].matcher as RegExp
  for (const path of [
    "/admin/products",
    "/admin/products/batch",
    "/admin/product-variants/variant_24",
  ])
    expect(matcher.test(path)).toBe(true)
  for (const path of [
    "/store/products/prod_switch",
    "/admin/product-attributes/templates",
  ])
    expect(matcher.test(path)).toBe(false)
})
