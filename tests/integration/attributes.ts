import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import type { ExecArgs, IProductModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
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
} from "@medusajs/medusa/core-flows"
import {
  PRODUCT_ATTRIBUTES,
  defineTemplate,
} from "@abhi1693/medusa-product-attributes"
import type ProductAttributesService from "@abhi1693/medusa-product-attributes/service"
import {
  mutateProductAttributes,
  productView,
  validateProduct,
  writeAttributesWorkflow,
} from "@abhi1693/medusa-product-attributes/workflows"
import type { AttributesMutation } from "@abhi1693/medusa-product-attributes/workflows"
import { readEnvelope } from "@abhi1693/medusa-product-attributes/validation"

async function rejects(operation: () => Promise<unknown>, expected: RegExp) {
  await assert.rejects(operation, (error: unknown) => {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error)
    assert.match(message, expected)
    return true
  })
}

export default async function integration({ container }: ExecArgs) {
  const database = new URL(process.env.DATABASE_URL || "")
  assert.ok(
    process.env.CI === "true" &&
      ["localhost", "127.0.0.1"].includes(database.hostname) &&
      /^\/attributes_plugin_[a-f0-9]{16}_test$/.test(database.pathname),
    "Integration checks require a disposable local CI database"
  )
  const service =
    container.resolve<ProductAttributesService>(PRODUCT_ATTRIBUTES)
  const products = container.resolve<IProductModuleService>(Modules.PRODUCT)
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
  const productId = created[0].id
  const variantId = created[0].variants[0].id
  let view = await productView(container, productId, true)
  const unassignedVersion = view.version
  view = await mutateProductAttributes(container, {
    product_id: productId,
    assignment: {
      version: view.version,
      template_id: template.id,
      template_version: 1,
    },
  })
  assert.equal(view.assignment_version, 1)
  assert.equal(view.validation.length, 3)
  assert.deepEqual(
    await validateProduct(container, productId),
    [],
    "A partial draft remains valid"
  )
  await rejects(
    () =>
      mutateProductAttributes(container, {
        product_id: productId,
        values: { version: unassignedVersion, values: { model: "stale" } },
      }),
    /record changed/
  )
  await rejects(
    () =>
      mutateProductAttributes(container, {
        product_id: productId,
        values: { version: view.version, values: { model: "   " } },
      }).then(() =>
        updateProductsWorkflow(container).run({
          input: { products: [{ id: productId, status: "published" }] },
        })
      ),
    /required/
  )
  view = await productView(container, productId, true)
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
  view = await mutateProductAttributes(container, {
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
  })
  assert.deepEqual(view.validation, [])
  assert.equal(view.values.managed, false)
  assert.equal(view.variants[0].values.ports, 0)
  await updateProductsWorkflow(container).run({
    input: { products: [{ id: productId, status: "published" }] },
  })
  const complete = await productView(container, productId, true)
  await rejects(
    () =>
      updateProductsWorkflow(container).run({
        input: {
          products: [
            {
              id: productId,
              metadata: {
                product_attributes: {
                  template_id: template.id,
                  template_version: 1,
                  version: complete.assignment_version,
                  values: { model: 42, managed: false },
                },
              },
            },
          ],
        },
      }),
    /Enter text/
  )
  assert.deepEqual(
    (await productView(container, productId, true)).values,
    complete.values,
    "A native rejected write restores the previous metadata"
  )
  await rejects(
    () =>
      batchProductsWorkflow(container).run({
        input: { update: [{ id: productId, metadata: null }] },
      }),
    /does not match/
  )
  assert.deepEqual(
    (await productView(container, productId, true)).values,
    complete.values
  )
  await rejects(
    () =>
      updateProductVariantsWorkflow(container).run({
        input: {
          product_variants: [
            {
              id: variantId,
              metadata: {
                product_attributes: { version: 2, values: { ports: 65 } },
              },
            },
          ],
        },
      }),
    /outside the allowed range/
  )
  assert.deepEqual(
    (await productView(container, productId, true)).variants[0].values,
    { ports: 0 }
  )
  await rejects(
    () =>
      batchProductVariantsWorkflow(container).run({
        input: { update: [{ id: variantId, metadata: null }] },
      }),
    /required/
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
  const malformedTitle = `Invalid namespace ${suffix}`
  await rejects(
    () =>
      createProductsWorkflow(container).run({
        input: {
          products: [
            {
              ...makeProduct(malformedTitle),
              metadata: { product_attributes: {} },
            },
          ],
        },
      }),
    /Invalid product attributes/
  )
  assert.equal(
    (await products.listProducts({ title: malformedTitle })).length,
    0
  )

  const beforeFailure = await productView(container, productId, true)
  const failure = createStep(
    `test-failure-${suffix}`,
    async (written: { product_id: string }) => {
      if (written.product_id) throw new Error("Injected downstream failure")
      return new StepResponse(false)
    }
  )
  const failureWorkflow = createWorkflow(
    `test-compensation-${suffix}`,
    (input: AttributesMutation) => {
      const written = writeAttributesWorkflow.runAsStep({ input })
      const failed = failure(written)
      return new WorkflowResponse(failed)
    }
  )
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
  assert.equal(
    afterFailure.assignment_version,
    beforeFailure.assignment_version,
    "Binding reservation compensates after native writes"
  )
  assert.deepEqual(afterFailure.values, beforeFailure.values)
  const retried = await mutateProductAttributes(container, {
    product_id: productId,
    values: {
      version: afterFailure.version,
      values: { model: "Retry succeeds" },
    },
  })
  assert.equal(retried.values.model, "Retry succeeds")
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

  const revision = await service.save(
    {
      ...definition,
      name: "Hardware revised",
      fields: definition.fields.map((field) =>
        field.key === "ports" ? { ...field, max: 32 } : field
      ),
    },
    "test-administrator",
    template.id,
    1
  )
  assert.equal(revision.version, 2)
  assert.equal(
    (await productView(container, productId, true)).template!.version,
    1,
    "Existing products stay pinned"
  )
  assert.equal((await service.revision(template.id, 1)).name, "Hardware")
  const [outdated, outdatedCount] =
    await service.listAndCountProductTemplateAssignments(
      { template_id: template.id, template_version: { $lt: 2 } },
      {
        skip: 0,
        take: 25,
        order: { id: "ASC" },
        select: ["id", "product_id", "template_version"],
      }
    )
  assert.equal(outdatedCount, 1)
  assert.equal(outdated[0].product_id, productId)
  const { data: impactProducts } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "product",
      fields: ["id", "title", "status"],
      filters: { id: [productId] },
    })
  assert.equal(impactProducts[0].id, productId)

  await rejects(
    () => service.save(definition, "test-administrator", template.id, 1),
    /record changed/
  )
  const beforeAdopt = await productView(container, productId, true)
  const adopted = await mutateProductAttributes(container, {
    product_id: productId,
    assignment: {
      version: beforeAdopt.version,
      template_id: template.id,
      template_version: 2,
    },
  })
  assert.equal(adopted.template!.version, 2)
  assert.equal(
    (
      await service.listAndCountProductTemplateAssignments({
        template_id: template.id,
        template_version: { $lt: 2 },
      })
    )[1],
    0
  )
  assert.equal(adopted.variants[0].values.ports, 0)
  await service.archive(template.id, 2)
  assert.equal(
    (await productView(container, productId, true)).template!.archived,
    true
  )
  assert.deepEqual(await validateProduct(container, productId, true), [])
  const originalNative = await products.retrieveProduct(productId, {
    relations: ["variants"],
  })
  assert.equal(originalNative.metadata!.merchant_key, "preserved")
  assert.equal(
    originalNative.variants[0].metadata!.merchant_variant_key,
    "preserved"
  )
  assert.equal(readEnvelope(originalNative.metadata)!.template_version, 2)

  // Direct module service calls are a trusted boundary, and bypass workflows.
  // The exported validator still detects invalid persisted publication state.
  await products.updateProducts(productId, {
    metadata: {
      product_attributes: {
        ...readEnvelope(originalNative.metadata)!,
        values: {},
      },
    },
  })
  assert.ok((await validateProduct(container, productId, true)).length > 0)
  await updateProductsWorkflow(container).run({
    input: { products: [{ id: productId, metadata: originalNative.metadata }] },
  })
  assert.deepEqual(await validateProduct(container, productId, true), [])
  console.info(
    "Product attributes integration checks passed: native workflows, batch validation, compensation/retry, concurrency, pinned revisions, values and metadata preservation"
  )
}
