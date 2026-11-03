import { Migration } from "@medusajs/framework/mikro-orm/migrations"

// Preserve existing snapshots while changing their schema to group composition.
// Data cleanup/import policy belongs to the consuming application, never startup.
export class Migration20261103124500 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "product_specification_revision" add column if not exists "groups" jsonb;')
    this.addSql(`do $migration$ begin
      if exists (
        select 1 from information_schema.columns
        where table_schema=current_schema() and table_name='product_specification_revision' and column_name='template_id'
      ) then
        update product_specification_revision
          set groups=jsonb_build_array(jsonb_build_object('template_id',template_id,'template_version',template_version))
          where groups is null;
      end if;
    end $migration$;`)
    this.addSql(`update "product_specification_revision" set "groups"='[]'::jsonb where "groups" is null;`)
    this.addSql('alter table "product_specification_revision" alter column "groups" set not null;')
    this.addSql('alter table "product_specification_revision" drop column if exists "template_id" cascade, drop column if exists "template_version" cascade;')
    this.addSql('alter table "product_specification" drop column if exists "template_id" cascade, drop column if exists "template_version" cascade;')
  }

  override async down(): Promise<void> {
    throw new Error("Group composition cannot be downgraded to one template. Restore a reviewed backup instead.")
  }
}
