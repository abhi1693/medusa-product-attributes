# Dependency compatibility

The pinned development baseline is Medusa 2.22.2, Medusa UI 4.2.9 and Vite 7.3.7. A peer range expresses an install constraint; it does not certify newer framework versions. Re-run package, native build, lifecycle and browser checks when upgrading.

Medusa 2.22.2's `@medusajs/utils` dependency family uses Zod 4 while retaining older GraphQL Code Generator dependencies. This repository uses a narrowly scoped alignment:

```json
{
  "overrides": {
    "@medusajs/utils@2.22.2": {
      "@graphql-codegen/core": "6.2.2",
      "@graphql-codegen/typescript": "6.1.2"
    }
  }
}
```

npm applies overrides only from the consuming project's root package manifest. Installing this plugin does not apply its development overrides to your app. Keep affected native query generation and Admin builds in upgrade validation. Reassess the override when upstream dependencies change; do not patch package sources or suppress real security findings.

The included compatibility host also installs a reviewed Medusa RBAC source revision and Admin Kit 0.3.1 to verify coexistence. Those are host integrations, not runtime dependencies of this plugin. The RBAC fixture is pinned to commit `721fc2636ec4373a171eedd7d1b1e740f05c3328`, which fixes native Product/Variant field selections; npm 0.0.1 lacks those fixes. Its Git build approval is restricted to that exact reviewed commit. Replace this fixture pin with a tested registry patch version when published; the plugin itself does not require a Git dependency. Admin Kit's older pinned Medusa peers are aligned to the host's direct dependencies using the host's scoped overrides. That resolution requires its own native Admin browser proof.
