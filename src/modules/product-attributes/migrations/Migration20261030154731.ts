import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261030154731 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "product_attribute_binding" drop constraint if exists "product_attribute_binding_product_id_unique";`
    )
    this.addSql(
      `alter table if exists "product_attribute_revision" drop constraint if exists "product_attribute_revision_template_id_version_unique";`
    )
    this.addSql(
      `alter table if exists "product_attribute_template" drop constraint if exists "product_attribute_template_key_unique";`
    )
    this.addSql(
      `create table if not exists "product_attribute_template" ("id" text not null, "key" text not null, "name" text not null, "version" integer not null default 1, "source" text check ("source" in ('configuration', 'admin')) not null default 'admin', "archived" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_attribute_template_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_attribute_template_key_unique" ON "product_attribute_template" ("key") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_attribute_template_deleted_at" ON "product_attribute_template" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "product_attribute_revision" ("id" text not null, "template_id" text not null, "version" integer not null, "definition" jsonb not null, "actor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_attribute_revision_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_attribute_revision_template_id" ON "product_attribute_revision" ("template_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_attribute_revision_deleted_at" ON "product_attribute_revision" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_attribute_revision_template_id_version_unique" ON "product_attribute_revision" ("template_id", "version") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "product_attribute_binding" ("id" text not null, "product_id" text not null, "template_id" text not null, "template_version" integer not null, "version" integer not null default 1, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_attribute_binding_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_attribute_binding_product_id_unique" ON "product_attribute_binding" ("product_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_attribute_binding_template_id" ON "product_attribute_binding" ("template_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_attribute_binding_deleted_at" ON "product_attribute_binding" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `alter table if exists "product_attribute_revision" add constraint "product_attribute_revision_template_id_foreign" foreign key ("template_id") references "product_attribute_template" ("id") on update cascade;`
    )

    this.addSql(
      `alter table if exists "product_attribute_binding" add constraint "product_attribute_binding_template_id_foreign" foreign key ("template_id") references "product_attribute_template" ("id") on update cascade;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "product_attribute_revision" drop constraint if exists "product_attribute_revision_template_id_foreign";`
    )

    this.addSql(
      `alter table if exists "product_attribute_binding" drop constraint if exists "product_attribute_binding_template_id_foreign";`
    )

    this.addSql(`drop table if exists "product_attribute_template" cascade;`)

    this.addSql(`drop table if exists "product_attribute_revision" cascade;`)

    this.addSql(`drop table if exists "product_attribute_binding" cascade;`)
  }
}
