# Medusa Product Attributes

[![CI](https://github.com/abhi1693/medusa-product-attributes/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/abhi1693/medusa-product-attributes/actions/workflows/ci.yml)
[![Medusa 2.22.2](https://img.shields.io/badge/Medusa-2.22.2-7c3aed)](https://docs.medusajs.com/)
[![MIT license](https://img.shields.io/github/license/abhi1693/medusa-product-attributes)](LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-abhi1693-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/abhi1693)

Typed product specifications and versioned templates for Medusa v2. Define reusable fields, edit values in the native Admin, and keep a consistent data contract for storefront presentation, indexing and comparison.

The plugin owns template definitions. Medusa Product and Product Variant metadata own the values. Your application supplies its categories, brands and authorization policy.

Development preview: the first release has not been published to npm. Build and inspect the package locally before installing it in an application.

## Capabilities

| Capability | Behavior |
| --- | --- |
| Typed specifications | Text, numbers with a declared unit and bounds, boolean values, single choice and multiple choices. |
| Product and variant fields | Templates distinguish shared product data from sellable-configuration data. |
| Native Admin editing | Settings pages manage templates; product and variant detail widgets expose specification editing. |
| Stable schemas | Templates have stable keys and immutable versions. Existing products retain their assigned version until explicitly updated. |
| Incremental authoring | Drafts can be incomplete. Publication validation reports missing or invalid required specifications. |
| Application configuration | Declare templates in code or create them in Admin. Merchant-specific definitions remain outside the plugin. |
| Extensible authorization | Use Medusa authentication with an application-supplied authorization callback. A particular RBAC package is not required. |
| Storefront contract | Normalized typed values and search/filter/comparison flags support downstream integrations. Storefront UI and search indexing are separate work. |

## Development

Requires Docker Compose. Node, npm, Medusa and browser tools run inside containers. The validated dependency baseline is Medusa **2.22.2**, UI **4.2.9**, Vite **7.3.7**, Node **24** and npm **11.19.0**.

Run commands from the repository root:

```sh
docker compose --profile tools run --rm --build --no-deps tooling npm run pack:local
```

The archive is generated at `artifacts/abhi1693-medusa-product-attributes-0.0.1.tgz` inside the shared development volume. The included isolated Medusa host consumes this built archive rather than a source link. See [development setup](docs/development.md) for administrator bootstrap, migration ordering and CI commands.

Normal Compose startup does not run unit, integration or browser tests. Select `compose.ci.yaml` explicitly when reproducing CI.

## Application configuration

Install the reviewed built archive in your Medusa application and register the plugin:

```ts
import { defineConfig } from "@medusajs/framework/utils"
import type { ProductAttributesOptions } from "@abhi1693/medusa-product-attributes/types"

const attributes: ProductAttributesOptions = {
  templates: [
    {
      key: "equipment",
      name: "Equipment specifications",
      fields: [
        {
          key: "capacity",
          label: "Capacity",
          type: "number",
          scope: "product",
          unit: "Gbps",
          min: 0,
          required: true,
          searchable: false,
          filterable: true,
          comparable: true,
        },
      ],
    },
  ],
}

module.exports = defineConfig({
  // ...projectConfig...
  plugins: [
    { resolve: "@abhi1693/medusa-product-attributes", options: attributes },
  ],
})
```

Run native migrations before starting application processes. To synchronize configured templates, add a CLI wrapper:

```ts
// src/scripts/sync-product-attributes.ts
export { default } from "@abhi1693/medusa-product-attributes/sync-templates"
```

Include this CLI command after migrations in your application's migration service. The public module service also exposes `synchronize()`. Synchronization preserves stable keys and existing assignments; changed definitions create immutable revisions. Do not register a second copy of the module.

An application's root dependency overrides are not inherited from this plugin. Review [dependency compatibility](docs/dependency-compatibility.md) when using the pinned Medusa baseline.

## Data and authorization boundaries

Assign a template explicitly to a product. Category associations suggest suitable templates; they do not silently switch a product's schema. Schema changes create a new version. Archiving prevents new assignments while preserving existing versions and values.

Values stored in native metadata must be safe for public disclosure. The search/filter/comparison flags describe intended presentation and indexing; they are not access controls. Do not place private operational notes or secrets in specification fields.

Custom Admin APIs require a native Medusa user. Without an authorization callback, authenticated administrators can manage attributes. Supply `authorize(request, context)` to enforce fine-grained application permissions for `templates.read`, `templates.write`, `values.read` and `values.write`. The server checks permission independently of button visibility.

Native workflow hooks run after native writes and use workflow compensation when validation fails. This is not a single transaction across modules. Hooks support one handler each; applications already consuming those hooks must compose the public validation handlers explicitly. Trusted scripts that call native module services directly must integrate validation themselves. See [framework evidence and limits](docs/research.md).

## License

MIT © Abhimanyu Saharan.
