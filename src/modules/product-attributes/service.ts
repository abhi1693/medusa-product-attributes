import { validateHighlightKeys } from "../../highlights"
import { randomUUID } from "node:crypto"
import type { Context } from "@medusajs/framework/types"
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex"
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils"
import {
  defineTemplate,
  resolveModuleOptions,
  defineTemplates,
} from "../../config"
import type {
  ProductAttributesOptions,
  AttributeValues,
  OwnedSpecification,
  SpecificationWriteInput,
  SpecificationWriteReceipt,
  TemplateDefinition,
  TemplateRevision,
  TemplateSummary,
} from "../../types"
import ProductAttributeTemplate from "./models/template"
import ProductAttributeRevision from "./models/revision"
import ProductSpecification from "./models/specification"
import ProductSpecificationRevision from "./models/specification-revision"
import ProductSpecificationVariant from "./models/specification-variant"
import { applicableTemplate, validateValues } from "../../validation"

export const conflict = (): never => {
  throw new MedusaError(
    MedusaError.Types.CONFLICT,
    "The record changed. Reload and try again."
  )
}
const invalid = (message: string): never => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, message)
}

export default class ProductAttributesService extends MedusaService({
  ProductAttributeTemplate,
  ProductAttributeRevision,
  ProductSpecification,
  ProductSpecificationRevision,
  ProductSpecificationVariant,
}) {
  readonly configuration: ReturnType<typeof resolveModuleOptions>
  constructor(
    container: Record<string, unknown>,
    options: ProductAttributesOptions = {}
  ) {
    super(...arguments)
    this.configuration = resolveModuleOptions(options)
  }

  @InjectManager()
  async specification(
    productId: string,
    includeUnlinked = false,
    @MedusaContext() context?: Context<EntityManager>
  ): Promise<OwnedSpecification | null> {
    const manager = context!.transactionManager || context!.manager!
    const [record] = await manager.execute<OwnedSpecification[]>(
      `select s.id,s.product_id,r.groups,s.version,s.linked,r.id as revision_id,r.values,r.variants,r.highlight_keys from product_specification s join product_specification_revision r on r.id=s.current_revision_id where s.product_id=? and s.deleted_at is null${includeUnlinked ? "" : " and s.linked=true"}`,
      [productId]
    )
    return record || null
  }

  @InjectTransactionManager()
  async writeSpecification(
    input: SpecificationWriteInput,
    @MedusaContext() context?: Context<EntityManager>
  ): Promise<SpecificationWriteReceipt> {
    const manager = context!.transactionManager!
    await manager.execute("select pg_advisory_xact_lock(903241011)")
    const before = await this.specification(input.product_id, true, context)
    if (
      (before && !before.linked) ||
      (before?.version || 0) !== input.expected_version
    )
      conflict()
    if (
      input.groups.length > 30 ||
      new Set(input.groups.map((group) => group.template_id)).size !==
        input.groups.length
    )
      invalid("Choose each specification group only once (maximum 30)")
    const groups: TemplateRevision[] = []
    for (const assignment of input.groups)
      groups.push(
        applicableTemplate(
          await this.revision(
            assignment.template_id,
            assignment.template_version,
            context
          ),
          assignment
        )
      )
    for (const group of groups)
      if (
        group.archived &&
        !before?.groups.some(
          (old) =>
            old.template_id === group.id &&
            old.template_version === group.version
        )
      )
        invalid("Archived groups cannot be assigned")
    const fields = groups.flatMap((group) => group.fields)
    if (new Set(fields.map((field) => field.key)).size !== fields.length)
      invalid("Groups contain duplicate field keys")
    const highlightKeys = validateHighlightKeys(
      input.highlight_keys === undefined
        ? (before?.highlight_keys?.filter((key) =>
            fields.some((field) => field.key === key)
          ) ?? null)
        : input.highlight_keys,
      fields
    )
    const issues = [
      ...validateValues(fields, input.values, "product", input.complete),
      ...Object.entries(input.variants).flatMap(([id, values]) =>
        validateValues(
          fields,
          values,
          "variant",
          input.complete,
          `variants.${id}.values`
        )
      ),
    ]
    if (issues.length)
      invalid(
        issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
      )
    const id = before?.id || `pspec_${randomUUID()}`
    const revisionId = `psrev_${randomUUID()}`
    const version = (before?.version || 0) + 1
    if (!before)
      await manager.execute(
        "insert into product_specification(id,product_id,version,linked) values(?,?,?,false)",
        [id, input.product_id, version]
      )
    await manager.execute(
      'insert into product_specification_revision(id,specification_id,groups,version,"values",variants,actor_id,highlight_keys) values(?,?,?::jsonb,?,?::jsonb,?::jsonb,?,?::jsonb)',
      [
        revisionId,
        id,
        JSON.stringify(input.groups),
        version,
        JSON.stringify(input.values),
        JSON.stringify(input.variants),
        input.actor_id,
        highlightKeys === null ? null : JSON.stringify(highlightKeys),
      ]
    )
    await manager.execute(
      "update product_specification set version=?,current_revision_id=?,updated_at=now() where id=?",
      [version, revisionId, id]
    )
    const created: SpecificationWriteReceipt["created_variants"] = []
    for (const variantId of Object.keys(input.variants)) {
      const [reference] = await manager.execute<
        Array<{ id: string; specification_id: string }>
      >(
        "select id,specification_id from product_specification_variant where variant_id=? and deleted_at is null",
        [variantId]
      )
      if (reference) {
        if (reference.specification_id !== id)
          invalid("A variant reference belongs to another specification")
        continue
      }
      const referenceId = `psvar_${randomUUID()}`
      await manager.execute(
        "insert into product_specification_variant(id,variant_id,specification_id) values(?,?,?)",
        [referenceId, variantId, id]
      )
      created.push({ id: referenceId, variant_id: variantId })
    }
    return {
      before,
      after: {
        id,
        product_id: input.product_id,
        groups: input.groups,
        highlight_keys: highlightKeys,
        version,
        revision_id: revisionId,
        values: input.values,
        variants: input.variants,
        linked: before?.linked || false,
      },
      created_variants: created,
    }
  }

  @InjectTransactionManager()
  async confirmSpecification(
    productId: string,
    revisionId: string,
    @MedusaContext() context?: Context<EntityManager>
  ) {
    const manager = context!.transactionManager!
    await manager.execute("select pg_advisory_xact_lock(903241011)")
    const current = await this.specification(productId, true, context)
    if (!current || current.revision_id !== revisionId) return conflict()
    await manager.execute(
      "update product_specification set linked=true,updated_at=now() where id=?",
      [current.id]
    )
  }

  @InjectTransactionManager()
  async restoreSpecification(
    receipt: SpecificationWriteReceipt,
    @MedusaContext() context?: Context<EntityManager>
  ) {
    const manager = context!.transactionManager!
    await manager.execute("select pg_advisory_xact_lock(903241011)")
    const current = await this.specification(
      receipt.after.product_id,
      true,
      context
    )
    const compensationId = `psrev_restore_${receipt.after.revision_id}`
    if (
      (!current && !receipt.before) ||
      current?.revision_id === compensationId
    )
      return
    if (!current || current.revision_id !== receipt.after.revision_id)
      return conflict()
    if (receipt.before) {
      const version = current.version + 1
      await manager.execute(
        "insert into product_specification_revision(id,specification_id,groups,version,\"values\",variants,actor_id,highlight_keys) values(?,?,?::jsonb,?,?::jsonb,?::jsonb,'system:compensation',?::jsonb)",
        [
          compensationId,
          current.id,
          JSON.stringify(receipt.before.groups),
          version,
          JSON.stringify(receipt.before.values),
          JSON.stringify(receipt.before.variants),
          receipt.before.highlight_keys == null
            ? null
            : JSON.stringify(receipt.before.highlight_keys),
        ]
      )
      await manager.execute(
        "update product_specification set version=?,current_revision_id=?,updated_at=now() where id=?",
        [version, compensationId, current.id]
      )
      for (const reference of receipt.created_variants)
        await manager.execute(
          "delete from product_specification_variant where id=?",
          [reference.id]
        )
    } else {
      await manager.execute(
        "update product_specification set current_revision_id=null where id=?",
        [current.id]
      )
      await manager.execute(
        "delete from product_specification_revision where specification_id=?",
        [current.id]
      )
      await manager.execute(
        "delete from product_specification_variant where specification_id=?",
        [current.id]
      )
      await manager.execute("delete from product_specification where id=?", [
        current.id,
      ])
    }
  }

  @InjectManager()
  async assignments(
    templateId: string,
    version: number,
    offset: number,
    limit: number,
    outdated: boolean,
    @MedusaContext() context?: Context<EntityManager>
  ) {
    const manager = context!.transactionManager || context!.manager!
    const where =
      "s.deleted_at is null and s.linked=true and g->>'template_id'=?" +
      (outdated ? " and (g->>'template_version')::integer < ?" : "")
    const params = outdated ? [templateId, version] : [templateId]
    const from =
      "from product_specification s join product_specification_revision r on r.id=s.current_revision_id cross join lateral jsonb_array_elements(r.groups) g where " +
      where
    const records = await manager.execute<
      Array<{ product_id: string; template_version: number }>
    >(
      "select s.product_id,(g->>'template_version')::integer as template_version " +
        from +
        " order by s.id offset ? limit ?",
      [...params, offset, limit]
    )
    const [count] = await manager.execute<Array<{ count: string }>>(
      "select count(*) " + from,
      params
    )
    return [records, Number(count.count)] as const
  }

  @InjectManager()
  async page(
    query: {
      q?: string
      offset?: number
      limit?: number
      include_archived?: boolean
    } = {},
    @MedusaContext() context?: Context<EntityManager>
  ) {
    const manager = context!.transactionManager || context!.manager!
    const offset = query.offset || 0
    const limit = query.limit || 25
    const where = `deleted_at is null${query.include_archived ? "" : " and archived = false"}${query.q ? " and (name ilike ? or key ilike ?)" : ""}`
    const params = query.q ? [`%${query.q}%`, `%${query.q}%`] : []
    const templates = await manager.execute<TemplateSummary[]>(
      `select id,key,name,version,archived,(select definition->'category_ids' from product_attribute_revision r where r.template_id=product_attribute_template.id and r.version=product_attribute_template.version) as category_ids from product_attribute_template where ${where} order by name,id offset ? limit ?`,
      [...params, offset, limit]
    )
    const [count] = await manager.execute<Array<{ count: string }>>(
      `select count(*) from product_attribute_template where ${where}`,
      params
    )
    return { templates, count: Number(count.count), offset, limit }
  }

  @InjectManager()
  async revision(
    id: string,
    version?: number,
    @MedusaContext() context?: Context<EntityManager>
  ): Promise<TemplateRevision> {
    const manager = context!.transactionManager || context!.manager!
    const [record] = await manager.execute<
      Array<TemplateSummary & { definition: TemplateDefinition }>
    >(
      "select t.id,t.key,t.archived,r.version,r.definition from product_attribute_template t join product_attribute_revision r on r.template_id=t.id and r.version=coalesce(?,t.version) where t.id=? and (t.deleted_at is null or ? is not null)",
      [version ?? null, id, version ?? null]
    )
    if (!record)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Template revision not found"
      )
    return {
      id: record.id,
      key: record.key,
      name: record.definition.name,
      version: record.version,
      archived: record.archived,
      description: record.definition.description || "",
      category_ids: record.definition.category_ids || [],
      fields: record.definition.fields,
    }
  }

  @InjectManager()
  async history(id: string, @MedusaContext() context?: Context<EntityManager>) {
    const manager = context!.transactionManager || context!.manager!
    const rows = await manager.execute<Array<{ version: number }>>(
      "select version from product_attribute_revision where template_id=? order by version desc",
      [id]
    )
    return Promise.all(
      rows.map((row) => this.revision(id, row.version, context))
    )
  }

  @InjectTransactionManager()
  async save(
    definition: TemplateDefinition,
    actorId: string,
    id?: string,
    version?: number,
    @MedusaContext() context?: Context<EntityManager>
  ) {
    const value = defineTemplate(definition)
    const manager = context!.transactionManager!
    await manager.execute("select pg_advisory_xact_lock(903241011)")
    let next = 1
    const targetId = id || `pat_${randomUUID()}`
    if (id) {
      const previous = await this.revision(id, undefined, context)
      if (previous.version !== version) conflict()
      if (previous.key !== value.key) invalid("A template key cannot change")
      if (previous.archived) invalid("Archived templates cannot be revised")
      next = previous.version + 1
      await manager.execute(
        "update product_attribute_template set name=?,version=?,updated_at=now() where id=?",
        [value.name, next, id]
      )
    } else {
      const existing = await manager.execute(
        "select id from product_attribute_template where key=?",
        [value.key]
      )
      if (existing.length) invalid("A template with this key already exists")
      await manager.execute(
        "insert into product_attribute_template(id,key,name,version,archived) values(?,?,?,1,false)",
        [targetId, value.key, value.name]
      )
    }
    await manager.execute(
      "insert into product_attribute_revision(id,template_id,version,definition,actor_id) values(?,?,?,?::jsonb,?)",
      [`par_${randomUUID()}`, targetId, next, JSON.stringify(value), actorId]
    )
    return this.revision(targetId, next, context)
  }

  @InjectTransactionManager()
  async archive(
    id: string,
    version: number,
    @MedusaContext() context?: Context<EntityManager>
  ) {
    const manager = context!.transactionManager!
    await manager.execute("select pg_advisory_xact_lock(903241011)")
    const template = await this.revision(id, undefined, context)
    if (template.version !== version) conflict()
    await manager.execute(
      "update product_attribute_template set archived=true,updated_at=now() where id=?",
      [id]
    )
    return this.revision(id, undefined, context)
  }

  /** Delete unused templates while retaining immutable history for previous revisions. */
  @InjectTransactionManager()
  async remove(
    id: string,
    version: number,
    @MedusaContext() context?: Context<EntityManager>
  ) {
    const manager = context!.transactionManager!
    await manager.execute("select pg_advisory_xact_lock(903241011)")
    const template = await this.revision(id, undefined, context)
    if (template.version !== version) conflict()
    const assigned = await manager.execute<Array<{ id: string }>>(
      "select s.id from product_specification s join product_specification_revision r on r.id=s.current_revision_id where s.deleted_at is null and exists (select 1 from jsonb_array_elements(r.groups) g where g->>'template_id'=?) limit 1",
      [id]
    )
    if (assigned.length)
      invalid(
        "Remove this template from its assigned products before deleting it. Archive it to keep current assignments."
      )
    await manager.execute(
      "update product_attribute_template set archived=true,deleted_at=now(),updated_at=now() where id=?",
      [id]
    )
    return { id, deleted: true as const }
  }

  /** Seed editable definitions once. Existing edits, archives and deletion tombstones win. */
  @InjectTransactionManager()
  async seedDefinitions(
    definitions: readonly TemplateDefinition[],
    actorId = "system:seed",
    @MedusaContext() context?: Context<EntityManager>
  ) {
    const validated = defineTemplates(definitions)
    const manager = context!.transactionManager!
    await manager.execute("select pg_advisory_xact_lock(903241011)")
    let created = 0
    for (const definition of validated) {
      const existing = await manager.execute(
        "select id from product_attribute_template where key=?",
        [definition.key]
      )
      if (existing.length) continue
      await this.save(definition, actorId, undefined, undefined, context)
      created++
    }
    return { created, skipped: validated.length - created }
  }
}
