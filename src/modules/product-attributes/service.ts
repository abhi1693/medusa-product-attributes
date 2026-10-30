import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import type { Context } from "@medusajs/framework/types"
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex"
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils"
import { defineTemplate, resolveModuleOptions } from "../../config"
import type {
  ProductAttributesOptions,
  ProductTemplateBinding,
  TemplateDefinition,
  TemplateRevision,
  TemplateSummary,
} from "../../types"
import AttributeTemplate from "./models/template"
import AttributeRevision from "./models/revision"
import ProductTemplateAssignment from "./models/binding"

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
  AttributeTemplate,
  AttributeRevision,
  ProductTemplateAssignment,
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
  async binding(
    productId: string,
    @MedusaContext() context?: Context<EntityManager>
  ): Promise<ProductTemplateBinding | null> {
    const manager = context!.transactionManager || context!.manager!
    const [binding] = await manager.execute<ProductTemplateBinding[]>(
      "select id,product_id,template_id,template_version,version from product_attribute_binding where product_id=? and deleted_at is null",
      [productId]
    )
    return binding || null
  }

  @InjectTransactionManager()
  async reserveBinding(
    productId: string,
    templateId: string,
    templateVersion: number,
    expectedVersion: number,
    @MedusaContext() context?: Context<EntityManager>
  ) {
    const manager = context!.transactionManager!
    await manager.execute("select pg_advisory_xact_lock(903241011)")
    const before = await this.binding(productId, context)
    if ((before?.version || 0) !== expectedVersion) conflict()
    const after: ProductTemplateBinding = {
      id: before?.id || `pab_${randomUUID()}`,
      product_id: productId,
      template_id: templateId,
      template_version: templateVersion,
      version: expectedVersion + 1,
    }
    if (before)
      await manager.execute(
        "update product_attribute_binding set template_id=?,template_version=?,version=?,updated_at=now() where id=?",
        [templateId, templateVersion, after.version, before.id]
      )
    else
      await manager.execute(
        "insert into product_attribute_binding(id,product_id,template_id,template_version,version) values(?,?,?,?,?)",
        [after.id, productId, templateId, templateVersion, after.version]
      )
    return { before, after }
  }

  @InjectTransactionManager()
  async restoreBinding(
    receipt: {
      before: ProductTemplateBinding | null
      after: ProductTemplateBinding
    },
    @MedusaContext() context?: Context<EntityManager>
  ) {
    const manager = context!.transactionManager!
    await manager.execute("select pg_advisory_xact_lock(903241011)")
    const current = await this.binding(receipt.after.product_id, context)
    if (current?.version !== receipt.after.version) conflict()
    if (receipt.before)
      await manager.execute(
        "update product_attribute_binding set template_id=?,template_version=?,version=?,updated_at=now() where id=?",
        [
          receipt.before.template_id,
          receipt.before.template_version,
          receipt.before.version,
          receipt.before.id,
        ]
      )
    else
      await manager.execute(
        "delete from product_attribute_binding where id=?",
        [receipt.after.id]
      )
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
      `select id,key,name,version,source,archived from product_attribute_template where ${where} order by name,id offset ? limit ?`,
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
      "select t.id,t.key,t.source,t.archived,r.version,r.definition from product_attribute_template t join product_attribute_revision r on r.template_id=t.id and r.version=coalesce(?,t.version) where t.id=? and t.deleted_at is null",
      [version ?? null, id]
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
      source: record.source,
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
      if (previous.source !== "admin")
        invalid("Configured templates are managed in application configuration")
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
        "insert into product_attribute_template(id,key,name,version,source,archived) values(?,?,?,1,'admin',false)",
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
    if (template.source !== "admin")
      invalid("Configured templates are managed in application configuration")
    if (template.version !== version) conflict()
    await manager.execute(
      "update product_attribute_template set archived=true,updated_at=now() where id=?",
      [id]
    )
    return this.revision(id, undefined, context)
  }

  @InjectTransactionManager()
  async synchronize(@MedusaContext() context?: Context<EntityManager>) {
    const manager = context!.transactionManager!
    await manager.execute("select pg_advisory_xact_lock(903241011)")
    const configured = this.configuration.templates
    let changed = 0
    for (const definition of configured) {
      const [existing] = await manager.execute<TemplateSummary[]>(
        "select id,key,name,version,source,archived from product_attribute_template where key=?",
        [definition.key]
      )
      if (existing && existing.source !== "configuration")
        invalid(
          `Configured template key ${definition.key} belongs to an Admin-managed template`
        )
      const before = existing
        ? await this.revision(existing.id, existing.version, context)
        : null
      const previous = before && {
        key: before.key,
        name: before.name,
        description: before.description,
        category_ids: before.category_ids,
        fields: before.fields,
      }
      if (
        existing &&
        !existing.archived &&
        isDeepStrictEqual(previous, definition)
      )
        continue
      const id = existing?.id || `pat_${randomUUID()}`
      const version = (existing?.version || 0) + 1
      if (existing)
        await manager.execute(
          "update product_attribute_template set name=?,version=?,archived=false,updated_at=now() where id=?",
          [definition.name, version, id]
        )
      else
        await manager.execute(
          "insert into product_attribute_template(id,key,name,version,source,archived) values(?,?,?,?,'configuration',false)",
          [id, definition.key, definition.name, version]
        )
      await manager.execute(
        "insert into product_attribute_revision(id,template_id,version,definition,actor_id) values(?,?,?,?::jsonb,'system:configuration')",
        [`par_${randomUUID()}`, id, version, JSON.stringify(definition)]
      )
      changed++
    }
    const removed = (await manager.execute<Array<{ id: string }>>(
      "select id,key from product_attribute_template where source='configuration' and archived=false"
    )) as Array<{ id: string; key: string }>
    for (const item of removed)
      if (!configured.some((definition) => definition.key === item.key)) {
        await manager.execute(
          "update product_attribute_template set archived=true,updated_at=now() where id=?",
          [item.id]
        )
        changed++
      }
    return { changed }
  }
}
