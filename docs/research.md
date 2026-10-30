# Framework and design evidence

Research date: 2026-10-30. Target: Medusa 2.22.2, Medusa UI 4.2.9 and Vite 7.3.7. The development baseline follows the validated Medusa RBAC package; compatibility must also be established in this plugin's packed consuming installation.

## Supported extension points

| Concern | Official reference | Contract and decision |
| --- | --- | --- |
| Reusable distribution | [Plugins](https://docs.medusajs.com/learn/fundamentals/plugins) and [creation/distribution](https://docs.medusajs.com/learn/fundamentals/plugins/create) | A plugin can distribute modules, APIs, workflows/hooks and Admin extensions. Package built server and Admin artifacts together. |
| Domain ownership | [Module isolation](https://docs.medusajs.com/learn/fundamentals/modules/isolation) | The template module owns its definitions. Cross-module Product/Variant operations belong in orchestration using public module services and workflows. Do not write Product tables from template SQL. |
| Native flow integration | [Workflow hooks](https://docs.medusajs.com/learn/fundamentals/workflows/workflow-hooks) and [extend product creation](https://docs.medusajs.com/learn/customization/extend-features/extend-create-product) | Inspect each pinned hook's input and execution point. A hook accepts one handler; integration with another consumer needs explicit composition. A post-write hook is not a pre-write constraint. |
| Failure behavior | [Workflow compensation](https://docs.medusajs.com/learn/fundamentals/workflows/compensation-function) | Verify native snapshots, compensation and grouped events with actual failure/retry tests. Do not describe multi-module orchestration as a single database transaction. |
| API boundary | [Middleware](https://docs.medusajs.com/learn/fundamentals/api-routes/middlewares) and [protected routes](https://docs.medusajs.com/learn/fundamentals/api-routes/protected-routes) | Native `/admin` authentication establishes the user. Custom authorization still runs on the server; the consuming app supplies fine-grained policy. |
| Admin integration | [Widgets](https://docs.medusajs.com/learn/fundamentals/admin/widgets), [routes](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes), [constraints](https://docs.medusajs.com/learn/fundamentals/admin/constraints) and [Medusa UI](https://docs.medusajs.com/ui) | Use public widgets, settings routes and UI. Product and variant details expose base zones `product.details` and `product_variant.details`; placement belongs to native layout configuration. No native form interception or DOM hiding. |

## Storage and evolution

Product and variant specification values belong in a namespaced native metadata document. Template definitions and immutable schema revisions belong in this module. Product assignment is explicit and pins a revision; a schema edit must not silently reinterpret existing product data. Merchant brands, categories and code-managed template declarations belong in application configuration.

Native metadata is already readable through commerce APIs. Attribute values must be safe for storefront disclosure. Search/filter/comparison flags describe downstream indexing and presentation; they are not confidentiality controls or a search engine implementation.

Drafts may be incomplete so editors can work incrementally. Publication requires complete applicable values. A publication gate checks specifications; it does not implement editorial review, approval, immutable content revisions or a publishing scheduler.

Native metadata merging is shallow: replacing the reserved namespace can replace its complete value. Preserve unrelated metadata and validate the whole candidate document. Inspect native direct, batch and import workflows separately before claiming coverage. Direct module calls from trusted scripts remain an explicit application integration boundary.

## Design requirements

The implementation requires native metadata ownership, template-specific server validation, safe schema evolution, supported Admin integration, optional authorization and verified consuming artifacts on the pinned version. Medusa v1 model inheritance is not compatible with v2 module isolation. Peer ranges are not runtime compatibility evidence. This repository uses public v2 extension points and a separate consuming host for validation.

## Required validation evidence

Record actual results with the final implementation: locked Docker installation; all declared package/type/browser exports; native application/Admin build; real PostgreSQL schema and service lifecycle; product/variant and publication/channel boundaries; invalid and stale writes; metadata preservation; failure/compensation/retry; and browser journeys in light/dark and narrow layouts. Keep local, hosted CI and production states distinct.
