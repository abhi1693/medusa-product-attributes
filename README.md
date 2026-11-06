# Medusa Product Attributes

[![CI](https://github.com/abhi1693/medusa-product-attributes/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/abhi1693/medusa-product-attributes/actions/workflows/ci.yml)
[![Medusa 2.22.2](https://img.shields.io/badge/Medusa-2.22.2-7c3aed)](https://docs.medusajs.com/)
[![MIT license](https://img.shields.io/github/license/abhi1693/medusa-product-attributes)](LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-abhi1693-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/abhi1693)

Reusable typed product attributes for Medusa v2. Create templates in Admin, assign several to a product, choose the applicable fields, and edit product or variant values with normal controls.

Native Medusa fields remain authoritative for dimensions, weight, customs information, inventory and prices. Native options define purchasable variants. This plugin owns additional attribute definitions and immutable value revisions linked to those native Products and Variants.

## Capabilities

| Capability                | Behavior                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed fields              | Text, finite numbers with units and bounds, Yes/No, single choice and multiple choices. Unset remains distinct from zero and No.                              |
| Editable templates        | Create, duplicate, revise, archive and delete unused templates in Settings → Attribute templates. Stable keys and immutable versions preserve interpretation. |
| Product applicability     | Assign up to 30 templates per product, selecting the fields that apply. Category associations offer recommendations without assigning anything automatically. |
| Product and variant scope | Shared product facts and independent native variant values. There is no implicit inheritance or invented variant combination.                                 |
| Focused editing           | Product attributes and Variant attributes widgets use native Admin drawers, validation feedback, confirmed discard and stale-write recovery.                  |
| Shallow sections          | One optional subsection heading groups independently typed fields without nested JSON values.                                                                 |
| Publication checks        | Partial drafts are allowed. Required applicable fields must be complete for published products and current variants.                                          |
| Store API                 | Typed current values for eligible published products in the publishable key’s sales channel.                                                                  |
| Optional authorization    | Native Medusa authentication plus an application-supplied permission adapter; no specific RBAC package required.                                              |

![Native Admin editor with reusable attribute templates](docs/assets/multiple-groups-editor.png)

## Install and configure

Validated against Medusa **2.22.2**, UI **4.2.9**, Vite **7.3.7**, Node **24** and npm **11.19.0**. Node 22.22 or newer is required. The peer range permits compatible Medusa v2 versions; the pinned baseline is the tested one.

```sh
npm install @abhi1693/medusa-product-attributes@0.0.1
```

Register the plugin once in your application’s `medusa-config.ts`:

```ts
import { defineConfig } from "@medusajs/framework/utils"

module.exports = defineConfig({
  // ...projectConfig and other plugins...
  plugins: [{ resolve: "@abhi1693/medusa-product-attributes", options: {} }],
})
```

Run your application’s normal `medusa db:migrate` before starting it. Review [dependency compatibility](docs/dependency-compatibility.md): dependency overrides in this plugin are not inherited by consuming applications. See [release notes](docs/releases/0.0.1.md) for the first release and migration details.

Create definitions in **Settings → Attribute templates**. Application-owned bootstrap scripts may call the public service’s `seedDefinitions(definitions, actorId)` after migrations and after resolving native category IDs. Seeding creates missing definitions once and preserves staff edits, archives and deletion tombstones on replay. Definitions remain editable database records; runtime configuration does not own or overwrite them.

Use `defineTemplate` or `defineTemplates` from the `/config` export to validate definitions before seeding. Template keys and field keys are stable identifiers; use human-readable labels separately. Every field declares `type`, `scope`, `required`, `searchable`, `filterable` and `comparable`. Numeric fields may declare `unit`, `min` and `max`; select fields require unique `{ value, label }` choices. Optional `subsection` is a single heading.

## Backend integration

The `/client` export provides a browser ESM and server CommonJS client using an authenticated transport. For example, pass an application’s configured Medusa SDK client:

```ts
import { createProductAttributesClient } from "@abhi1693/medusa-product-attributes/client"

const attributes = createProductAttributesClient(sdk.client)
const current = await attributes.product(productId)
const assigned = await attributes.assignGroups(productId, {
  version: current.version,
  groups: [
    {
      template_id: connectivity.id,
      template_version: connectivity.version,
      field_keys: ["port_count", "interfaces"],
    },
  ],
})
await attributes.saveValues(productId, {
  version: assigned.version,
  values: { port_count: 8, interfaces: ["ethernet"] },
})
```

Assignments replace the complete ordered template list. Omit `field_keys` to include all fields of the pinned revision, or supply a nonempty unique selection. Duplicate template IDs and duplicate field keys across assigned templates are rejected. Removed fields leave the current snapshot while immutable history remains. A value patch preserves unrelated fields; `null` explicitly clears a value.

Template edits create a new version without changing existing product assignments. **Use latest version** explicitly adopts a newer definition and retains compatible selected keys and values. Validation rejects incompatible values and incomplete required data on published products. Complete new required fields through a trusted combined workflow or the normal draft authoring lifecycle before publication.

| API                                                       | Purpose                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET/POST /admin/product-attributes/templates`            | List or create templates.                                                              |
| `GET/POST/DELETE /admin/product-attributes/templates/:id` | Read history, create a revision or delete an unused template with an expected version. |
| `POST /admin/product-attributes/templates/:id/archive`    | Archive a template; existing assignments remain valid.                                 |
| `GET /admin/product-attributes/templates/:id/products`    | Paginated assignment impact, including earlier pinned versions.                        |
| `GET /admin/product-attributes/products/:id`              | Assigned schemas, current values, validation and capabilities.                         |
| `POST /admin/product-attributes/products/:id/groups`      | Replace assignments with an expected current token.                                    |
| `POST /admin/product-attributes/products/:id/values`      | Patch typed product or variant values with current tokens.                             |
| `POST /admin/product-attributes/products/:id/validate`    | Check required current product and variant fields.                                     |
| `POST /admin/product-attributes/products/:id/export`      | Explicit optional one-way native metadata projection.                                  |
| `GET /store/products/:id/attributes`                      | Complete current public attributes for the eligible channel.                           |

## Authorization and data boundaries

Without an `authorize` callback, authenticated native administrators can manage attributes. An application may supply `ProductAttributesOptions.authorize(request, context)`, returning **true** explicitly to grant `templates.read`, `templates.write`, `values.read`, `values.write` or `metadata.export`. Exceptions fail closed. Context includes the relevant product or template ID where applicable. The adapter must enforce application policy on the server.

Mutations require read and write permission. Assignment editing also requires global template-read access. A value reader receives the assigned schemas needed to interpret values but cannot obtain the global template catalog without its read grant. The response exposes `can_write` and `can_assign` separately. Metadata export requires its own grant in addition to value read/write; the application must include permission to update native Product/Variant metadata in that grant.

Canonical revisions and pointers commit atomically within this plugin’s module. Native workflow hooks validate publication and variant changes; native failures use workflow compensation. This is not one transaction across modules and does not globally serialize native workflows. Specification revisions survive unrelated native Product compensation. Public links support deletion/restoration and retry. See the accepted [storage design](docs/storage-decision.md).

Native workflow hooks support one handler each. Applications already using those hooks must set `register_native_hooks: false` and compose the exported validation handlers in their own hook. Trusted scripts calling native services directly must integrate validation themselves. See [framework evidence](docs/research.md).

The Store endpoint requires a complete current revision, native publication and channel eligibility. It does not fall back to an older revision. Do not put private notes or secrets in public attributes or optional metadata exports. Native relation guards prevent exposing internal history through standard Admin/Store product projections.

## Limits

Searchable, filterable and comparable are descriptive flags. This release does not provide a storefront UI, search index, filter query engine, facet counts or indexing event pipeline. The [storefront filtering contract](docs/storefront-filtering.md) describes the separate work required.

Numbers support finite decimals, not an integer-only constraint. Units are declarations, not automatic conversion. Templates have at most 100 fields; select fields have at most 100 choices. Product and variant fields have separate scopes. There is no arbitrary nested value model, file attribute type or automatic migration of existing catalog content.

## Development and verification

Use Docker Compose from the repository root. Node, npm, Medusa and Playwright run inside containers. Normal startup does not run tests or seed merchant data.

```sh
docker compose --profile tools run --rm --build --no-deps tooling npm run pack:local
docker compose -f compose.yaml -f compose.ci.yaml --profile ci run --rm --build checks sh -ec "npm run format:check && npm run typecheck"
docker compose -f compose.yaml -f compose.ci.yaml --profile ci up --build --abort-on-container-exit --exit-code-from test test
```

Checks cover unit/component behavior with 100% per-file coverage, package exports, publisher recovery, native PostgreSQL lifecycle and compensation, clean locked installation, native Admin build and browser journeys. See [development](docs/development.md) and [release procedure](docs/releasing.md).

## License

MIT © Abhimanyu Saharan.

## Per-product storefront highlights

A separate **Storefront highlights** widget on the product detail page selects
and orders up to six attributes from that product's assigned schemas. It does
not edit attribute values, full specifications or reusable templates. Variant
fields continue to use the selected variant's saved value.

The versioned product setting is `highlight_keys`: `null` uses the first six
assigned fields in schema order, `[]` hides highlights, and an ordered array
chooses specific fields. Existing products keep the default without a backfill.
Selections are stored in immutable specification revisions with the existing
atomic pointer, actor audit, concurrency checks and workflow compensation.
Detaching fields removes them from an inherited selection without changing
other selected fields. Custom writes reject duplicates, unknown keys and more
than six fields.

`POST /admin/product-attributes/products/:id/highlights` accepts
`{ version, highlight_keys }` and requires the existing `values.read` and
`values.write` grants. Consumers with path-based authorization profiles must
explicitly register this command. The configured client exposes `saveHighlights`.
The Admin product response includes stored `highlight_keys` and
`effective_highlight_keys`; the existing public attributes endpoint includes the
resolved ordered `highlight_keys` for storefront rendering. Publication and
sales-channel eligibility checks continue to apply.

The widget has the stable ID `product-attributes:storefront-highlights` in the
public `product.details` zone. It supports defaults, empty selections, ordering,
search, permission states, unsaved-change confirmation, and stale-save recovery.
Apply the included additive migration through normal Medusa migrations before
running the updated module. No catalog seed or template rewrite is required.
