import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261106110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "product_specification_revision" add column if not exists "highlight_keys" jsonb null;'
    )
  }
  override async down(): Promise<void> {
    this.addSql(
      'alter table "product_specification_revision" drop column if exists "highlight_keys";'
    )
  }
}
