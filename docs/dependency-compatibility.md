# Dependency compatibility

The development and host builds use Medusa 2.23.0, Medusa UI 4.3.0, React 19.3.1 and Vite 8.3.8. The host must resolve a single React and React DOM instance so the extension uses the Dashboard's hooks context. [Medusa 2.23.0 release notes](https://github.com/medusajs/medusa/releases/tag/v2.23.0)

Medusa 2.23.0 selects GraphQL Code Generator 6 directly. The scoped Code Generator overrides for 2.22.2 can be removed when upgrading a host. Validate package exports and the native host's generated query types during the upgrade. [Medusa utils manifest](https://github.com/medusajs/medusa/blob/v2.23.0/packages/core/utils/package.json)

The compatibility host installs the exact reviewed RBAC commit recorded in its manifest and scopes its Git build approval to that commit. It also uses Admin Kit 0.4.0 with scoped overrides to share the host's Medusa, React and translation packages. The plugin itself has no mandatory RBAC or Admin Kit dependency.

The host registers product attributes through the RBAC package's public `defineResource` and `commandProfile` exports. One resource declaration binds template and specification operations to their capabilities; the authorization engine does not gain plugin-specific URL exceptions. Unknown descendants and unsupported methods remain denied. The product-attributes plugin still calls its configurable authorization callback and has no mandatory RBAC dependency.
