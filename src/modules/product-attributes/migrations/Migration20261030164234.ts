import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261030164234 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "product_specification_variant" drop constraint if exists "product_specification_variant_variant_id_unique";`
    )
    this.addSql(
      `alter table if exists "product_specification" drop constraint if exists "product_specification_current_revision_id_unique";`
    )
    this.addSql(
      `alter table if exists "product_specification" drop constraint if exists "product_specification_product_id_unique";`
    )
    this.addSql(
      `alter table if exists "product_specification_revision" drop constraint if exists "product_specification_revision_specification_id_version_unique";`
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
      `create table if not exists "product_specification_revision" ("id" text not null, "specification_id" text not null, "template_id" text not null, "template_version" integer not null, "version" integer not null, "values" jsonb not null, "variants" jsonb not null, "actor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_specification_revision_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_specification_revision_specification_id" ON "product_specification_revision" ("specification_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_specification_revision_template_id" ON "product_specification_revision" ("template_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_specification_revision_deleted_at" ON "product_specification_revision" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_specification_revision_specification_id_version_unique" ON "product_specification_revision" ("specification_id", "version") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "product_specification" ("id" text not null, "product_id" text not null, "template_id" text not null, "template_version" integer not null, "version" integer not null default 1, "linked" boolean not null default false, "current_revision_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_specification_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_specification_product_id_unique" ON "product_specification" ("product_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_specification_template_id" ON "product_specification" ("template_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_specification_current_revision_id_unique" ON "product_specification" ("current_revision_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_specification_deleted_at" ON "product_specification" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "product_specification_variant" ("id" text not null, "variant_id" text not null, "specification_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_specification_variant_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_specification_variant_variant_id_unique" ON "product_specification_variant" ("variant_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_specification_variant_specification_id" ON "product_specification_variant" ("specification_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_specification_variant_deleted_at" ON "product_specification_variant" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `alter table if exists "product_attribute_revision" add constraint "product_attribute_revision_template_id_foreign" foreign key ("template_id") references "product_attribute_template" ("id") on update cascade;`
    )

    this.addSql(
      `alter table if exists "product_specification_revision" add constraint "product_specification_revision_specification_id_foreign" foreign key ("specification_id") references "product_specification" ("id") on update cascade on delete cascade;`
    )
    this.addSql(
      `alter table if exists "product_specification_revision" add constraint "product_specification_revision_template_id_foreign" foreign key ("template_id") references "product_attribute_template" ("id") on update cascade;`
    )

    this.addSql(
      `alter table if exists "product_specification" add constraint "product_specification_template_id_foreign" foreign key ("template_id") references "product_attribute_template" ("id") on update cascade;`
    )
    this.addSql(
      `alter table if exists "product_specification" add constraint "product_specification_current_revision_id_foreign" foreign key ("current_revision_id") references "product_specification_revision" ("id") on update cascade on delete set null;`
    )

    this.addSql(
      `alter table if exists "product_specification_variant" add constraint "product_specification_variant_specification_id_foreign" foreign key ("specification_id") references "product_specification" ("id") on update cascade on delete cascade;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "product_attribute_revision" drop constraint if exists "product_attribute_revision_template_id_foreign";`
    )

    this.addSql(
      `alter table if exists "product_specification_revision" drop constraint if exists "product_specification_revision_template_id_foreign";`
    )

    this.addSql(
      `alter table if exists "product_specification" drop constraint if exists "product_specification_template_id_foreign";`
    )

    this.addSql(
      `alter table if exists "product_specification" drop constraint if exists "product_specification_current_revision_id_foreign";`
    )

    this.addSql(
      `alter table if exists "product_specification_revision" drop constraint if exists "product_specification_revision_specification_id_foreign";`
    )

    this.addSql(
      `alter table if exists "product_specification_variant" drop constraint if exists "product_specification_variant_specification_id_foreign";`
    )

    this.addSql(`drop table if exists "product_attribute_template" cascade;`)

    this.addSql(`drop table if exists "product_attribute_revision" cascade;`)

    this.addSql(
      `drop table if exists "product_specification_revision" cascade;`
    )

    this.addSql(`drop table if exists "product_specification" cascade;`)

    this.addSql(`drop table if exists "product_specification_variant" cascade;`)
  }
}
