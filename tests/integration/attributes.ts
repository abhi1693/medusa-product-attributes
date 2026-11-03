import { createRequire } from "node:module"
import path from "node:path"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import type {
  ExecArgs,
  IProductModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ModulesSdkUtils } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  batchProductsWorkflow,
  batchProductVariantsWorkflow,
  createProductsWorkflow,
  createProductVariantsWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
  deleteProductsWorkflow,
  deleteProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  PRODUCT_ATTRIBUTES,
  defineTemplate,
} from "@abhi1693/medusa-product-attributes"
import type Service from "@abhi1693/medusa-product-attributes/service"
import {
  mutateProductAttributes,
  productView,
  validateProduct,
  writeAttributesWorkflow,
  exportProductAttributesMetadata,
} from "@abhi1693/medusa-product-attributes/workflows"
import type { AttributesMutation } from "@abhi1693/medusa-product-attributes/workflows"

async function rejects(operation: () => Promise<unknown>, expected: RegExp) {
  await assert.rejects(operation, (error: unknown) => {
    assert.match(
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error),
      expected
    )
    return true
  })
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

export default async function integration({ container }: ExecArgs) {
  const database = new URL(process.env.DATABASE_URL || "")
  assert.ok(
    process.env.CI === "true" &&
      ["localhost", "127.0.0.1"].includes(database.hostname) &&
      /^\/attributes_plugin_[a-f0-9]{16}_test$/.test(database.pathname),
    "Integration checks require a disposable local CI database"
  )
  // Exercise the packed forward migration against the previous table shape in
  // a separate schema; native commerce tables and the real module stay untouched.
  const connection = ModulesSdkUtils.createPgConnection({ clientUrl: database.href, pool: { min: 0, max: 1 } })
  try {
    await connection.transaction(async transaction => {
      await transaction.raw('create schema group_upgrade_probe')
      await transaction.raw('set local search_path to group_upgrade_probe')
      await transaction.raw('create table product_specification (id text primary key, template_id text not null, template_version integer not null)')
      await transaction.raw('create table product_specification_revision (id text primary key, template_id text not null, template_version integer not null, "values" jsonb not null)')
      await transaction.raw("insert into product_specification values ('spec', 'group', 3)")
      await transaction.raw('insert into product_specification_revision values (?, ?, ?, ?::jsonb)', ['revision', 'group', 3, JSON.stringify({ ports: 8 })])
      const require = createRequire(path.join(process.cwd(), "package.json"))
      const root = path.dirname(require.resolve("@abhi1693/medusa-product-attributes/package.json"))
      const { Migration20261103124500 } = require(path.join(root, ".medusa/server/src/modules/product-attributes/migrations/Migration20261103124500.js"))
      for (let attempt = 0; attempt < 2; attempt++) {
        const migration = new Migration20261103124500(undefined, undefined)
        await migration.up()
        for (const sql of migration.getQueries()) await transaction.raw(sql)
      }
      const [row] = await transaction('product_specification_revision').select('*')
      assert.deepEqual(row.groups, [{ template_id: "group", template_version: 3 }])
      assert.deepEqual(row.values, { ports: 8 })
      assert.equal(Object.hasOwn(row, "template_id"), false)
      assert.deepEqual(await transaction('product_specification').select('*'), [{ id: "spec" }])
      await transaction.raw('drop schema group_upgrade_probe cascade')
    })
  } finally {
    await connection.destroy()
  }
  console.info("Forward group schema migration preserves existing values and is safe on a second application")
  const service = container.resolve<Service>(PRODUCT_ATTRIBUTES)
  const products = container.resolve<IProductModuleService>(Modules.PRODUCT)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const suffix = randomUUID().replaceAll("-", "")
  const definition = defineTemplate({
    key: `hardware_${suffix}`,
    name: "Hardware",
    fields: [
      {
        key: "model",
        label: "Model",
        type: "text",
        scope: "product",
        required: true,
        searchable: true,
        filterable: true,
        comparable: true,
      },
      {
        key: "ports",
        label: "Ports",
        type: "number",
        scope: "variant",
        required: true,
        min: 0,
        max: 64,
        unit: "ports",
        searchable: false,
        filterable: true,
        comparable: true,
      },
      {
        key: "managed",
        label: "Managed",
        type: "boolean",
        scope: "product",
        required: true,
        searchable: false,
        filterable: true,
        comparable: true,
      },
    ],
  })
  const template = await service.save(definition, "test-administrator")
  const makeProduct = (title: string) => ({
    title,
    status: "draft" as const,
    metadata: { merchant_key: "preserved" },
    options: [{ title: "Configuration", values: ["Default", "Extra"] }],
    variants: [
      {
        title: "Default",
        manage_inventory: false,
        options: { Configuration: "Default" },
        metadata: { merchant_variant_key: "preserved" },
      },
    ],
  })
  const { result: created } = await createProductsWorkflow(container).run({
    input: {
      products: [
        makeProduct(`Attributes ${suffix}`),
        makeProduct(`Other ${suffix}`),
      ],
    },
  })
  const productId = created[0].id,
    variantId = created[0].variants[0].id
  let view = await productView(container, productId, true)
  assert.equal(view.version, "unassigned")
  view = await mutateProductAttributes(
    container,
    {
      product_id: productId,
      assignment: {
        version: view.version,
        groups: [{ template_id: template.id, template_version: 1 }],
      },
    },
    true,
    "user_administrator"
  )
  assert.equal(view.assignment_version, 1)
  assert.equal(view.validation.length, 3)
  assert.deepEqual(
    await validateProduct(container, productId),
    [],
    "A partial owned draft remains valid"
  )
  assert.ok((await service.specification(productId))!.linked)
  await rejects(
    () =>
      mutateProductAttributes(container, {
        product_id: productId,
        values: { version: "unassigned", values: { model: "stale" } },
      }),
    /record changed/
  )
  await rejects(
    () =>
      updateProductsWorkflow(container).run({
        input: { products: [{ id: productId, status: "published" }] },
      }),
    /required/
  )
  assert.equal((await products.retrieveProduct(productId)).status, "draft")
  await rejects(
    () =>
      mutateProductAttributes(container, {
        product_id: productId,
        values: {
          version: view.version,
          variants: [
            {
              id: created[1].variants[0].id,
              version: view.variants[0].version,
              values: { ports: 8 },
            },
          ],
        },
      }),
    /does not belong/
  )
  view = await mutateProductAttributes(
    container,
    {
      product_id: productId,
      values: {
        version: view.version,
        values: { model: "Example", managed: false },
        variants: [
          {
            id: variantId,
            version: view.variants[0].version,
            values: { ports: 0 },
          },
        ],
      },
    },
    true,
    "user_editor"
  )
  assert.deepEqual(view.validation, [])
  assert.equal(view.values.managed, false)
  assert.equal(view.variants[0].values.ports, 0)
  assert.equal(
    (await products.retrieveProduct(productId)).metadata!.merchant_key,
    "preserved"
  )
  assert.equal(
    (await products.retrieveProductVariant(variantId)).metadata!
      .merchant_variant_key,
    "preserved"
  )
  const immutableBefore = await service.specification(productId)
  assert.equal(
    (
      await service.listProductSpecificationRevisions({
        id: immutableBefore!.revision_id,
      })
    )[0].actor_id,
    "user_editor"
  )
  await updateProductsWorkflow(container).run({
    input: { products: [{ id: productId, status: "published" }] },
  })
  assert.equal(
    (await productView(container, productId, true)).version,
    view.version,
    "Unrelated native timestamps do not change specification versions"
  )

  // Native metadata is independent. Forged values, null and CSV-style batch
  // writes cannot change owned specification values or immutable revision IDs.
  await updateProductsWorkflow(container).run({
    input: {
      products: [
        {
          id: productId,
          metadata: { product_attributes: { values: { model: 42 } } },
        },
      ],
    },
  })
  await batchProductsWorkflow(container).run({
    input: { update: [{ id: productId, metadata: null }] },
  })
  await updateProductVariantsWorkflow(container).run({
    input: {
      product_variants: [
        {
          id: variantId,
          metadata: { product_attributes: { values: { ports: 999 } } },
        },
      ],
    },
  })
  await batchProductVariantsWorkflow(container).run({
    input: { update: [{ id: variantId, metadata: null }] },
  })
  assert.equal(
    (await service.specification(productId))!.revision_id,
    immutableBefore!.revision_id
  )
  assert.deepEqual(
    (await productView(container, productId, true)).values,
    view.values
  )
  const variantCount = (
    await products.retrieveProduct(productId, { relations: ["variants"] })
  ).variants.length
  await rejects(
    () =>
      createProductVariantsWorkflow(container).run({
        input: {
          product_variants: [
            {
              product_id: productId,
              title: "Invalid extra",
              manage_inventory: false,
              options: { Configuration: "Extra" },
            },
          ],
        },
      }),
    /required/
  )
  assert.equal(
    (await products.retrieveProduct(productId, { relations: ["variants"] }))
      .variants.length,
    variantCount
  )

  // A failed first module-link creation must remove provisional records, with a
  // clean retry for the same native product and variant identities.
  const otherId = created[1].id
  const originalLinkCreate = link.create
  let injectLinkFailure = true
  link.create = async function (
    ...args: Parameters<typeof originalLinkCreate>
  ) {
    if (injectLinkFailure) {
      injectLinkFailure = false
      const data = Array.isArray(args[0]) ? args[0] : [args[0]]
      await originalLinkCreate.call(this, [data[0]])
      throw new Error("Injected specification link failure")
    }
    return originalLinkCreate.apply(this, args)
  }
  try {
    await rejects(
      () =>
        mutateProductAttributes(container, {
          product_id: otherId,
          assignment: {
            version: "unassigned",
            groups: [{ template_id: template.id, template_version: 1 }],
          },
        }),
      /Injected specification link failure/
    )
  } finally {
    link.create = originalLinkCreate
  }
  assert.equal(await service.specification(otherId, true), null)
  assert.equal(
    (await service.listProductSpecifications({ product_id: otherId })).length,
    0
  )
  const { data: orphanLinks } = await query.graph({
    entity: "product_product_specification",
    fields: ["product_id", "product_specification_id"],
    filters: { product_id: otherId },
  })
  assert.equal(
    orphanLinks.length,
    0,
    "Partial first link creation is compensated without orphan link records"
  )
  let other = await mutateProductAttributes(container, {
    product_id: otherId,
    assignment: {
      version: "unassigned",
      groups: [{ template_id: template.id, template_version: 1 }],
    },
  })
  assert.equal(other.groups[0]!.id, template.id)
  const transactionBefore = (await service.specification(productId))!
  const historyBefore = (
    await service.listAndCountProductSpecificationRevisions({
      specification_id: transactionBefore.id,
    })
  )[1]
  await rejects(
    () =>
      service.writeSpecification({
        product_id: productId,
        groups: [{ template_id: template.id, template_version: 1 }],
        expected_version: transactionBefore.version,
        complete: false,
        values: { model: "Must roll back", managed: false },
        variants: { [created[1].variants[0].id]: {} },
        actor_id: "test-transaction-conflict",
      }),
    /another specification/
  )
  assert.equal(
    (await service.specification(productId))!.revision_id,
    transactionBefore.revision_id,
    "A late own-module failure rolls back the current revision pointer"
  )
  assert.equal(
    (
      await service.listAndCountProductSpecificationRevisions({
        specification_id: transactionBefore.id,
      })
    )[1],
    historyBefore,
    "A late own-module failure leaves no partial immutable revision"
  )

  const failure = createStep(
    `test-owned-failure-${suffix}`,
    async (written: { product_id: string }) => {
      if (written.product_id) throw new Error("Injected downstream failure")
      return new StepResponse(false)
    }
  )
  const failureWorkflow = createWorkflow(
    `test-owned-compensation-${suffix}`,
    (input: AttributesMutation) => {
      const written = writeAttributesWorkflow.runAsStep({ input })
      return new WorkflowResponse(failure(written))
    }
  )
  const beforeFailure = await productView(container, productId, true)
  await rejects(
    () =>
      failureWorkflow(container).run({
        input: {
          product_id: productId,
          values: {
            version: beforeFailure.version,
            values: { model: "Rollback me" },
          },
        },
      }),
    /Injected downstream failure/
  )
  const afterFailure = await productView(container, productId, true)
  assert.deepEqual(afterFailure.values, beforeFailure.values)
  assert.ok(
    afterFailure.assignment_version > beforeFailure.assignment_version,
    "Rollback creates another immutable revision without reusing versions"
  )
  const retried = await mutateProductAttributes(container, {
    product_id: productId,
    values: {
      version: afterFailure.version,
      values: { model: "Retry succeeds" },
    },
  })
  assert.equal(retried.values.model, "Retry succeeds")
  other = await productView(container, otherId, true)
  await rejects(
    () =>
      failureWorkflow(container).run({
        input: {
          product_id: otherId,
          values: {
            version: other.version,
            variants: [
              {
                id: other.variants[0].id,
                version: other.variants[0].version,
                values: { ports: 12 },
              },
            ],
          },
        },
      }),
    /Injected downstream failure/
  )
  assert.deepEqual(
    (await productView(container, otherId, true)).variants[0].values,
    {}
  )
  const race = await Promise.allSettled(
    ["First", "Second"].map((model) =>
      mutateProductAttributes(container, {
        product_id: productId,
        values: { version: retried.version, values: { model } },
      })
    )
  )
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(race.filter((result) => result.status === "rejected").length, 1)

  // Deterministic regression: native parent captures its previous metadata,
  // then a canonical specification write commits before the parent rolls back.
  let current = await productView(container, productId, true)
  const originalExportUpsert = products.upsertProducts
  products.upsertProducts = async function () {
    throw new Error("Injected metadata export failure")
  } as typeof products.upsertProducts
  try {
    await rejects(
      () =>
        exportProductAttributesMetadata(container, productId, current.version),
      /Injected metadata export failure/
    )
  } finally {
    products.upsertProducts = originalExportUpsert
  }
  assert.equal(
    (await service.specification(productId))!.revision_id,
    current.version,
    "Metadata export failure never rolls back authoritative values"
  )
  assert.deepEqual(
    (await service.specification(productId))!.values,
    current.values
  )
  await exportProductAttributesMetadata(container, productId, current.version)
  const nativeReached = deferred(),
    resumeNative = deferred()
  const pauseNative = createStep(
    `pause-native-parent-${suffix}`,
    async (written: Array<{ id: string }>) => {
      nativeReached.resolve()
      await resumeNative.promise
      if (written.length) throw new Error("Injected native parent failure")
      return new StepResponse(false)
    }
  )
  const nativeParent = createWorkflow(
    `native-parent-race-${suffix}`,
    (input: { id: string }) => {
      const written = updateProductsWorkflow.runAsStep({
        input: {
          products: [{ id: input.id, title: "Temporary native title" }],
        },
      })
      return new WorkflowResponse(pauseNative(written))
    }
  )
  const parent = nativeParent(container).run({ input: { id: productId } })
  const parentRejected = rejects(() => parent, /Injected native parent failure/)
  await nativeReached.promise
  const survived = await mutateProductAttributes(container, {
    product_id: productId,
    values: {
      version: current.version,
      values: { model: "Survives native rollback" },
    },
  })
  resumeNative.resolve()
  await parentRejected
  assert.equal(
    (await productView(container, productId, true)).version,
    survived.version
  )
  assert.equal(
    (await productView(container, productId, true)).values.model,
    "Survives native rollback"
  )
  assert.notEqual(
    (await products.retrieveProduct(productId)).title,
    "Temporary native title"
  )

  // Ordinary native title editing during an already-committed owned update
  // must not encounter a transient assignment/version mismatch.
  const ownedReached = deferred(),
    resumeOwned = deferred(),
    originalWrite = service.writeSpecification
  service.writeSpecification = async function (
    ...args: Parameters<Service["writeSpecification"]>
  ) {
    const receipt = await originalWrite.apply(this, args)
    ownedReached.resolve()
    await resumeOwned.promise
    return receipt
  }
  try {
    const pending = mutateProductAttributes(container, {
      product_id: productId,
      values: {
        version: survived.version,
        values: { model: "Native overlap safe" },
      },
    })
    await ownedReached.promise
    await updateProductsWorkflow(container).run({
      input: { products: [{ id: productId, title: "Native title preserved" }] },
    })
    resumeOwned.resolve()
    await pending
  } finally {
    resumeOwned.resolve()
    service.writeSpecification = originalWrite
  }
  assert.equal(
    (await productView(container, productId, true)).values.model,
    "Native overlap safe"
  )
  assert.equal(
    (await products.retrieveProduct(productId)).title,
    "Native title preserved"
  )

  const revision = await service.save(
    {
      ...definition,
      name: "Hardware revised",
      fields: definition.fields.map((field) =>
        field.key === "ports" ? { ...field, max: 32 } : field
      ),
    },
    "user_administrator",
    template.id,
    1
  )
  assert.equal(revision.version, 2)
  assert.equal(
    (await productView(container, productId, true)).groups[0]!.version,
    1
  )
  assert.equal((await service.revision(template.id, 1)).name, "Hardware")
  const [outdated, count] = await service.assignments(
    template.id,
    2,
    0,
    25,
    true
  )
  assert.equal(count, 2)
  assert.ok(outdated.some((item) => item.product_id === productId))
  const { data: impact } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "status",
      "product_specification.id",
      "product_specification.current_revision.id",
      "variants.product_specification_variant.id",
    ],
    filters: { id: [productId] },
  })
  assert.equal(impact[0].id, productId)
  assert.ok(
    impact[0].product_specification?.id,
    "Native Query traverses public Product specification link"
  )
  assert.equal(
    impact[0].product_specification.current_revision.id,
    (await service.specification(productId))!.revision_id
  )
  assert.ok(
    impact[0].variants[0].product_specification_variant?.id,
    "Native Query traverses the public Variant specification link"
  )
  await rejects(
    () => service.save(definition, "user_administrator", template.id, 1),
    /record changed/
  )
  current = await productView(container, productId, true)
  const adopted = await mutateProductAttributes(container, {
    product_id: productId,
    assignment: {
      version: current.version,
      groups: [{ template_id: template.id, template_version: 2 }],
    },
  })
  assert.equal(adopted.groups[0]!.version, 2)
  assert.equal(adopted.variants[0].values.ports, 0)
  assert.equal((await service.assignments(template.id, 2, 0, 25, true))[1], 1)
  await service.archive(template.id, 2)
  assert.equal(
    (await productView(container, productId, true)).groups[0]!.archived,
    true
  )
  assert.deepEqual(await validateProduct(container, productId, true), [])

  // Public link cascade lifecycle includes native rollback and normal deletion.
  const otherVariant = created[1].variants[0].id
  const beforeDeleteRefs = await service.listProductSpecificationVariants({
    variant_id: otherVariant,
  })
  assert.equal(beforeDeleteRefs.length, 1)
  await deleteProductVariantsWorkflow(container).run({
    input: { ids: [otherVariant] },
  })
  assert.equal(
    (
      await service.listProductSpecificationVariants({
        variant_id: otherVariant,
      })
    ).length,
    0
  )
  await products.restoreProductVariants([otherVariant])
  await link.restore({
    [Modules.PRODUCT]: {
      product_variant_id: [otherVariant],
      variant_id: [otherVariant],
    },
  })
  assert.equal(
    (
      await service.listProductSpecificationVariants({
        variant_id: otherVariant,
      })
    ).length,
    1
  )
  const deleteThenFail = createWorkflow(
    `delete-specification-rollback-${suffix}`,
    (input: { ids: string[] }) => {
      deleteProductsWorkflow.runAsStep({ input })
      return new WorkflowResponse(failure({ product_id: input.ids[0] }))
    }
  )
  await rejects(
    () => deleteThenFail(container).run({ input: { ids: [otherId] } }),
    /Injected downstream failure/
  )
  assert.ok(
    await service.specification(otherId),
    "Native delete rollback restores owned specification cascade links"
  )
  await deleteProductsWorkflow(container).run({ input: { ids: [otherId] } })
  assert.equal(await service.specification(otherId), null)
  await products.restoreProducts([otherId])
  await link.restore({
    [Modules.PRODUCT]: {
      product_id: [otherId],
      product_variant_id: [otherVariant],
      variant_id: [otherVariant],
    },
  })
  assert.ok(
    await service.specification(otherId),
    "Explicit native restore + Link.restore restores owned snapshot"
  )
  // Hosts resolve native categories after migration, then synchronize complete
  // app-owned definitions without mutating plugin configuration at startup.
  const category = await products.createProductCategories({
    name: `Definitions ${suffix}`,
    handle: `definitions-${suffix}`,
  })
  const configuredDefinition = defineTemplate({
    ...definition,
    key: `resolved_${suffix}`,
    category_ids: [category.id],
  })
  const definitions = Object.freeze([configuredDefinition])
  const configurationBefore = JSON.stringify(service.configuration.templates)
  assert.equal((await service.synchronizeDefinitions(definitions)).changed, 1)
  const synced = (await service.page({ q: configuredDefinition.key }))
    .templates[0]
  assert.equal(synced.source, "configuration")
  assert.deepEqual((await service.revision(synced.id)).category_ids, [
    category.id,
  ])
  assert.equal(
    (await service.synchronizeDefinitions(definitions)).changed,
    0,
    "Resolved definitions synchronize idempotently"
  )
  assert.equal(
    JSON.stringify(service.configuration.templates),
    configurationBefore,
    "Explicit definitions never mutate module configuration"
  )
  assert.equal(
    (
      await service.synchronizeDefinitions([
        { ...configuredDefinition, name: "Resolved definition revised" },
      ])
    ).changed,
    1
  )
  assert.equal((await service.revision(synced.id)).version, 2)
  assert.equal(
    (await service.revision(synced.id, 1)).name,
    configuredDefinition.name
  )
  assert.equal((await service.synchronizeDefinitions([])).changed, 1)
  assert.equal((await service.revision(synced.id)).archived, true)
  assert.equal((await service.synchronizeDefinitions([])).changed, 0)
  await verifyAtomicInitialization(container, suffix)
  console.info(
    "Owned specifications integration passed: transactions/CAS, native links, immutable revisions, native rollback isolation, metadata independence and delete/restore"
  )
}

export async function verifyAtomicInitialization(
  container: MedusaContainer,
  suffix: string
) {
  const service = container.resolve<Service>(PRODUCT_ATTRIBUTES),
    link = container.resolve(ContainerRegistrationKeys.LINK),
    query = container.resolve(ContainerRegistrationKeys.QUERY)
  const template = await service.save(
    defineTemplate({
      key: `atomic_${suffix}`,
      name: "Atomic initialization",
      fields: [
        {
          key: "model",
          label: "Model",
          type: "text",
          scope: "product",
          required: true,
          searchable: false,
          filterable: false,
          comparable: true,
        },
        {
          key: "managed",
          label: "Managed",
          type: "boolean",
          scope: "product",
          required: true,
          searchable: false,
          filterable: false,
          comparable: true,
        },
        {
          key: "ports",
          label: "Ports",
          type: "number",
          scope: "variant",
          required: true,
          min: 0,
          max: 64,
          searchable: false,
          filterable: false,
          comparable: true,
        },
      ],
    }),
    "test-atomic-initialization"
  )
  const {
    result: [product],
  } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: `Published atomic ${suffix}`,
          status: "published",
          options: [{ title: "Configuration", values: ["Default"] }],
          variants: [
            {
              title: "Default",
              manage_inventory: false,
              options: { Configuration: "Default" },
            },
          ],
        },
      ],
    },
  })
  const before = await productView(container, product.id, true)
  const combined = {
    product_id: product.id,
    assignment: {
      version: before.version,
      groups: [{ template_id: template.id, template_version: 1 }],
    },
    values: {
      version: before.version,
      values: { model: "Complete first snapshot", managed: false },
      variants: before.variants.map((variant) => ({
        id: variant.id,
        version: variant.version,
        values: { ports: 0 },
      })),
    },
  }
  await rejects(
    () =>
      mutateProductAttributes(container, {
        ...combined,
        values: { ...combined.values, version: "stale" },
      }),
    /record changed/
  )
  await rejects(
    () =>
      mutateProductAttributes(container, {
        ...combined,
        assignment: { ...combined.assignment, version: "stale" },
      }),
    /record changed/
  )
  assert.equal(
    await service.specification(product.id, true),
    null,
    "Either stale parent token refuses initialization before writing"
  )
  let observedRevisions = 0
  const create = link.create
  link.create = async function (...args: Parameters<typeof create>) {
    const owned = (await service.specification(product.id, true))!
    observedRevisions = (
      await service.listAndCountProductSpecificationRevisions({
        specification_id: owned.id,
      })
    )[1]
    const links = Array.isArray(args[0]) ? args[0] : [args[0]]
    await create.call(this, [links[0]])
    throw new Error("Injected atomic first-link failure")
  }
  try {
    await rejects(
      () =>
        mutateProductAttributes(container, combined, true, "seed:atomic-check"),
      /Injected atomic first-link failure/
    )
  } finally {
    link.create = create
  }
  assert.equal(
    observedRevisions,
    1,
    "Combined initialization writes exactly one complete snapshot before linking"
  )
  assert.equal(
    await service.specification(product.id, true),
    null,
    "Failed combined first assignment removes its one provisional snapshot"
  )
  const { data: orphans } = await query.graph({
    entity: "product_product_specification",
    fields: ["product_id", "product_specification_id"],
    filters: { product_id: product.id },
  })
  assert.equal(orphans.length, 0)
  const initialized = await mutateProductAttributes(
    container,
    combined,
    true,
    "seed:atomic-check"
  )
  assert.equal(initialized.assignment_version, 1)
  assert.equal(initialized.values.model, "Complete first snapshot")
  assert.equal(initialized.values.managed, false)
  assert.equal(initialized.variants[0].values.ports, 0)
  assert.deepEqual(initialized.validation, [])
  assert.deepEqual(await validateProduct(container, product.id, true), [])
  const owned = (await service.specification(product.id))!
  assert.equal(
    (
      await service.listAndCountProductSpecificationRevisions({
        specification_id: owned.id,
      })
    )[1],
    1
  )
  assert.equal(
    (
      await service.listProductSpecificationRevisions({ id: owned.revision_id })
    )[0].actor_id,
    "seed:atomic-check"
  )
  console.info(
    "Atomic assignment+values initialization passed for a published native Product, including stale-token refusal and partial-link rollback/retry"
  )
}
