# Specification storage decision

Status: **accepted and implemented on 2026-10-30**. Use module-owned versioned specifications linked to native Products/Variants, with validated current storefront snapshots. Native metadata is an optional export. The packed consuming application's native integration and browser checks pass; the first release remains pending application evaluation.

## Reproduced behavior

Target: Medusa 2.22.2. The native `updateProductsStep` snapshots the complete previous Product record and uses the owning Product service to restore it during workflow compensation. That snapshot includes metadata and has no expected-version check against a later independent write.

The real integration probe interleaved these operations:

1. A specification write reserved its next protected assignment version.
2. A native product-title update captured the previous metadata snapshot. Its post-write validation encountered the in-progress assignment and failed.
3. The specification write completed successfully.
4. The delayed native compensation restored the older metadata. The assignment and value document no longer matched, preventing normal reads.

First-time namespace rollback, ordinary downstream-failure retry, canonical stale-write rejection and normal native validation passed independently. They do not rule out the interleaving above.

A pending assignment transition can prevent the particular transient validation failure, but it cannot stop another failing native workflow from subsequently restoring an old metadata snapshot. Removing the version check would conceal the inconsistency rather than preserve the successful edit.

## Supported options

| Design                                                                   | Preserves                                                                                                                                        | Required boundary                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module-owned versioned specifications and validated storefront snapshots | Native commerce records, Admin extensions and import workflows; specification data cannot be overwritten by native Product metadata compensation | Use public module links, module-owned transactions and immutable specification revisions. Metadata can be an optional projection rather than the source of truth. Native Product publication/channel visibility still needs explicit validation; this does not make native workflows globally serializable. |
| Authoritative native metadata with controlled writers                    | The original storage choice                                                                                                                      | Every specification-related native writer must participate in a supported shared-lock workflow over its entire execution and compensation. Unmodified asynchronous native imports and arbitrary direct workflows cannot be assumed to participate.                                                          |

The first option was explicitly selected. Keep the existing Admin/API shape where possible. A current incomplete snapshot is withheld from Store reads rather than silently serving older specifications. This storage change does not introduce editorial approval, a separate manual publication workflow or globally serializable native Product status.

## Framework evidence

Read the current [workflow locking guide](https://docs.medusajs.com/learn/fundamentals/workflows/locks), [workflow hook constraints](https://docs.medusajs.com/learn/fundamentals/workflows/workflow-hooks), [module isolation](https://docs.medusajs.com/learn/fundamentals/modules/isolation) and [API customization guidance](https://docs.medusajs.com/learn/fundamentals/api-routes/override).

The inspected native Product/Variant workflows expose post-write hooks. Native asynchronous import chunk processing later invokes `batchProductsWorkflow` outside the HTTP request lifetime. A request lock or a hook acquired after the snapshot cannot cover that entire lifecycle. Passing an EntityManager within one custom module does not place the existing native workflow in the same transaction.
