import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261103153000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table if exists "product_attribute_template" drop column if exists "source";'
    )
  }
  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "product_attribute_template" add column if not exists "source" text check ("source" in ('configuration', 'admin')) not null default 'admin';`
    )
  }
}
