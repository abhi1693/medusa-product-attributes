# Storefront filtering readiness

The plugin supplies typed specifications that a storefront can present and a backend integration can project into a search index. It does not currently implement specification-based product-list filtering, facet counts, a search index, or storefront filter controls. The `searchable`, `filterable`, and `comparable` flags describe integration intent; setting them does not install those capabilities.

## Current public contract

`GET /store/products/:id/attributes` returns the assigned template's stable key, immutable version and field definitions, product values, and separate values for each current native variant ID. Field definitions retain their type, scope, option codes and labels, numeric unit and bounds, and integration flags.

Use option `value` codes as filter values and labels for display. Numbers remain finite JSON numbers in the field's declared unit; units are separate display/schema data. The plugin validates bounds but does not convert units or normalize free-form text. Preserve boolean `false` and numeric `0`; they are valid values. A `null` write clears a value, and missing values must remain distinct from false or zero. Multiple selections remain arrays of unique option codes.

The Store endpoint checks native publication, the publishable key's sales channels, and completeness against the assigned schema. It returns the complete current specification revision or withholds it; it does not serve an older fallback. Search flags are not confidentiality controls: specification values must be safe for public disclosure regardless of their flags. Private specification/history relations remain protected on native HTTP routes.

## Stable filter meaning

Identify a field by template key, scope and field key. Bare field keys are unique only within a template, so they cannot safely identify a global facet. Treat option codes as semantic identifiers rather than renaming them when a display label changes. Choose consistent units for comparable numeric fields.

Products retain their assigned schema version until explicitly updated. A later version can change a field's type, scope, unit, choices or flags. An integration must therefore interpret values using their assigned version, and combine versions only when their meaning is compatible. A template's latest version must not silently redefine products pinned to earlier versions. Changing an index definition requires its own reindexing strategy. [Medusa's reindexing guide](https://docs.medusajs.com/resources/infrastructure-modules/search/reindexing) explains native index versioning.

Host-defined seed flags need the same review as Admin-defined fields. Enable filtering only for intended customer refinements; synthetic development controls and comparison-only fields should not become customer facets automatically.

## Product and variant predicates

Keep variant values grouped by native variant ID. If a query requires a red, extra-large variant, one variant must satisfy both conditions. A red small variant and a blue extra-large variant must not satisfy that conjunction.

Medusa's shipped search providers flatten object-array leaves and explicitly do not guarantee matching within one array element. A future integration must choose a supported variant-aware query/projection strategy before offering combined variant filters; flattening all variant values onto a product is insufficient. [Search index field limitations](https://docs.medusajs.com/resources/infrastructure-modules/search/index-definitions/fields) document this behavior.

## Future backend integration

Medusa 2.22.2 provides a Search Module with a PostgreSQL provider, so this does not require introducing an external search engine. A consuming application must still declare its index and explicitly expose it through the Store Search API. Native product-list query parameters do not automatically accept specification fields or return facets. The separate experimental Index Module does not make this plugin's field flags into search definitions. See [Search Module](https://docs.medusajs.com/resources/infrastructure-modules/search), [PostgreSQL provider](https://docs.medusajs.com/resources/infrastructure-modules/search/providers/postgres), and [Index Module](https://docs.medusajs.com/learn/fundamentals/query/index-module).

A future adapter should project only supported typed fields and operator semantics: exact choice codes, numeric ranges, boolean equality, and explicit any/all membership for multiple selections. Apply publication, channel eligibility and valid-current-specification rules to both hits and facet counts on the server. Never rely on browser-side filtering to protect a result set. Native Store Search applies publication/channel filters only when the required index fields are declared or equivalent server-side filters are configured.

There is currently **no plugin-defined committed specification-revision event**. Specification writes, confirmation, compensation and template definition writes must not be assumed to emit `product.updated`. An adapter cannot stay current by listening only to native Product updates. Before implementing indexing, define committed change notifications and idempotent consumers that reread canonical state. Account for value writes, assignment/version adoption, relevant schema changes, compensation, native product/variant deletion or restoration, publication changes and sales-channel link changes. Preserve existing pinned products when a template is archived. [Indexing linked data](https://docs.medusajs.com/resources/infrastructure-modules/search/index-definitions/linked-data) explains why linked changes require explicit ingestion handling.

Before exposing queries, verify zero/false/missing behavior, range boundaries and units, stable choice codes, mixed schema versions, same-variant conjunction, duplicate/out-of-order updates, and consistent eligible-product facet counts.

## Review evidence

Reviewed on 2026-10-31 against Medusa 2.22.2 and plugin source `e643db6781297e54ce99e7b184f6b96ffabbcfd0`. Inspected `src/types.ts`, `src/config.ts`, `src/validation.ts`, Store handlers, specification/template services, workflow writes and module links. No Search definition, ingestion subscriber or explicit revision-event emitter exists in that source. Native inspection covered Store Product validators, Store Search routing/scoping, Search index loading, and PostgreSQL projection/filter planning. This is a source/documentation audit, not a completed search integration or new runtime validation claim.
