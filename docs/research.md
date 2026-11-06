# Framework and design evidence

Research date: 2026-10-30. Target: Medusa 2.22.2, Medusa UI 4.2.9 and Vite 7.3.7. The development baseline follows the validated Medusa RBAC package; compatibility must also be established in this plugin's packed consuming installation.

## Supported extension points

| Concern                 | Official reference                                                                                                                                                                                                                                                         | Contract and decision                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reusable distribution   | [Plugins](https://docs.medusajs.com/learn/fundamentals/plugins) and [creation/distribution](https://docs.medusajs.com/learn/fundamentals/plugins/create)                                                                                                                   | A plugin can distribute modules, APIs, workflows/hooks and Admin extensions. Package built server and Admin artifacts together.                                                                                                         |
| Domain ownership        | [Module isolation](https://docs.medusajs.com/learn/fundamentals/modules/isolation)                                                                                                                                                                                         | The template module owns its definitions. Cross-module Product/Variant operations belong in orchestration using public module services and workflows. Do not write Product tables from template SQL.                                    |
| Native flow integration | [Workflow hooks](https://docs.medusajs.com/learn/fundamentals/workflows/workflow-hooks) and [extend product creation](https://docs.medusajs.com/learn/customization/extend-features/extend-create-product)                                                                 | Inspect each pinned hook's input and execution point. A hook accepts one handler; integration with another consumer needs explicit composition. A post-write hook is not a pre-write constraint.                                        |
| Failure behavior        | [Workflow compensation](https://docs.medusajs.com/learn/fundamentals/workflows/compensation-function)                                                                                                                                                                      | Verify native snapshots, compensation and grouped events with actual failure/retry tests. Do not describe multi-module orchestration as a single database transaction.                                                                  |
| API boundary            | [Middleware](https://docs.medusajs.com/learn/fundamentals/api-routes/middlewares) and [protected routes](https://docs.medusajs.com/learn/fundamentals/api-routes/protected-routes)                                                                                         | Native `/admin` authentication establishes the user. Custom authorization still runs on the server; the consuming app supplies fine-grained policy.                                                                                     |
| Admin integration       | [Widgets](https://docs.medusajs.com/learn/fundamentals/admin/widgets), [routes](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes), [constraints](https://docs.medusajs.com/learn/fundamentals/admin/constraints) and [Medusa UI](https://docs.medusajs.com/ui) | Use public widgets, settings routes and UI. Product and variant details expose base zones `product.details` and `product_variant.details`; placement belongs to native layout configuration. No native form interception or DOM hiding. |

## Storage and evolution

The accepted design keeps product and variant specification values in immutable module-owned revisions with an atomic current pointer and public native Product/Variant links. Native metadata is an optional one-way projection. Product assignment is explicit and pins a schema revision; a schema edit must not silently reinterpret existing product data. Merchant brands, categories and seed definitions belong in the consuming application; definitions are editable database records.

Store readers receive only complete current revisions for published, channel-eligible native products and current native variants. There is no implicit last-published fallback. Storefront values and optional metadata exports must be safe for public disclosure. Search/filter/comparison flags describe downstream indexing and presentation; they are not confidentiality controls or a search engine implementation.

Drafts may be incomplete so editors can work incrementally. Publication requires complete applicable values. A publication gate checks specifications; editorial review, approval and scheduling remain application concerns.

Native workflow compensation can restore an older full metadata snapshot after a separate successful metadata write. Real interleaving proved this; see the [storage decision](storage-decision.md). Module-owned revisions avoid that loss. Any optional metadata export must preserve unrelated metadata and must not make projection failure roll back authoritative revisions. Inspect native direct, batch and import workflows separately before claiming coverage. Direct module calls from trusted scripts remain an explicit application integration boundary.

## Design requirements

The implementation requires module-owned immutable specification revisions, public native module links, template-specific server validation, safe schema evolution, supported Admin integration, optional authorization and verified consuming artifacts on the pinned version. Medusa v1 model inheritance is not compatible with v2 module isolation. Peer ranges are not runtime compatibility evidence. This repository uses public v2 extension points and a separate consuming host for validation.

## Required validation evidence

Record actual results with the final implementation: locked Docker installation; all declared package/type/browser exports; native application/Admin build; real PostgreSQL schema and service lifecycle; product/variant and publication/channel boundaries; invalid and stale writes; metadata preservation; failure/compensation/retry; and browser journeys in light/dark and narrow layouts. Keep local, hosted CI and production states distinct.

## Composable specification groups — 2026-11-03

Target remains Medusa 2.22.2, UI 4.2.9 and Vite 7.3.7. Rechecked the installed Product and ProductVariant models, product HTTP validators, native product Attributes form, supported widget zones and `product/utils/create-default-inventory-item.js`.

Official evidence:

- https://docs.medusajs.com/resources/commerce-modules/product/physical-customs-attributes
- https://docs.medusajs.com/learn/fundamentals/admin/widgets
- https://docs.medusajs.com/learn/fundamentals/modules/isolation

Physical/customs fields exist independently on native Product and Variant. Variant-to-inventory copying at creation is not live synchronization. Native numbers carry no persisted unit; applications must declare a consistent convention and convert at fulfillment boundaries.

A product's immutable specification revision now pins multiple reusable definition revisions. Existing module transactions, concurrency checks, public Product/Variant links and normalized authorized Store reads remain. Duplicate group IDs or field keys are rejected at workflow and owning service boundaries. Groups are the existing reusable template concept, not another entity layer. Variant fields retain explicit scope without inheritance. Actual facets/indexing remain separate.

The initial schema uses group composition. A forward schema migration converts an existing single assignment into a one-group snapshot and removes obsolete columns, preserving values and current pointers. This is a schema migration, not a compatibility reader or automatic catalog cleanup. Application-specific repairs remain explicit operations; no database reset or deployment is bundled.

## Release audit: editable templates and permission boundaries

Verified against the pinned Medusa 2.22.2 host. Runtime configuration no longer owns templates. The public service seeds validated definitions once and preserves database edits, archive state and deleted-key tombstones. Normal schema migration removes the obsolete origin column without rewriting immutable definitions or native commerce records.

HTTP mutations require read and write grants, and assignment edits require global template-read access. Values-only readers retain assigned schema interpretation without access to the global catalog. Metadata export has an explicit application grant covering native metadata writes. Authorization callbacks grant only on literal true. Open Admin value and assignment drafts retain the schema and compare-and-swap base they were opened with; background query refresh cannot silently advance their token. Template adoption remains explicit and is checked against server-side typed/publication constraints.

The pinned native `buildGenerateMigrationScript` uses a filesystem snapshot through `Migrations.ensureSnapshot`, rather than inspecting the live application database. Missing metadata causes a complete create migration to be generated again. The package therefore includes the generated module snapshot, verifies its exact bytes during build/packing, and asserts that native generation produces no additional migration. Fresh application migration, replay and real owning-service lifecycle checks validate the installed database separately. No earlier migration ID is rewritten.

## Per-product storefront highlights — 2026-11-06

Target: Medusa 2.22.2, UI 4.2.9, Query 5.64.2. Rechecked the public widget contract
at https://docs.medusajs.com/learn/fundamentals/admin/widgets and the installed
`defineWidgetConfig`, `Drawer`, `Checkbox`, `Button` and SDK client exports. The
new widget uses its own stable ID in `product.details`, leaving the existing
specification widget and template editors unchanged.

A nullable JSON selection belongs to the module-owned immutable specification
revision, alongside groups/values/variants. The existing public workflow owns
native membership checks, locking, compare-and-swap, audit and compensation;
all SQL remains inside this module's tables. The Admin command uses existing
values read/write authorization, and the Store endpoint resolves order only
after its existing native publication/channel/completeness checks. No metadata
fallback or native Product schema change was introduced.

Validation: Docker package build and packed export checks passed; native clean
locked consuming installation passed. Unit/component suite: 178 tests across
20 files with 100% per-file statements, branches, functions and lines. Isolated
PostgreSQL integration passed, including migration replay and no additional
migration from native schema generation, persistent custom/empty/reset settings,
stale/unknown refusal, preserved product/variant values, transactional history,
native rollback isolation and delete/restore lifecycle. A real consuming Admin
save/reload and storefront read verified selection/order; public specification
values were unchanged from their pre-save snapshot. Browser verification used
the assistant in-app browser. No package release is included.
