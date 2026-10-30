# Repository guidelines

## Scope and ownership

Build a reusable Medusa v2 plugin for typed product attributes and specification templates. Keep brands, merchant taxonomies, roles and catalog policy in the consuming application. Use stable attribute keys and normalized values. Native Product/Variant metadata owns specification values; the plugin owns template definitions and revisions. Do not duplicate products, variants, inventory, prices or authentication. No legacy adapters or migration scripts for an earlier implementation.

## Research before implementation

Before implementing or changing behavior:

1. Read repository instructions, README and the relevant documents. Inspect Git status, package/lockfile versions, existing code and tests. Distinguish a planned feature from shipped behavior.
2. Identify data ownership, actor/authorization boundaries, lifecycle, failure, concurrency and retry requirements. Research existing public GitHub plugins, including older implementations, before building a new capability. Evaluate their actual code, licenses, package artifacts and compatibility; peer ranges and README claims alone are insufficient.
3. Read the current official Medusa concept guide, API reference, relevant recipe and constraints. Use https://docs.medusajs.com/llms.txt and each page's `.md` alternative when necessary. Search snippets and remembered APIs are starting points, not implementation evidence. Use official Docker, npm and Playwright documentation for their behavior.
4. Inspect the matching installed native module/service, types, route validators, workflows/hooks, compensation and public Admin components. Baseline: Medusa 2.22.2, UI 4.2.9, Vite 7.3.7. Verify public exports and signatures. Reading internal source does not make a private import a supported extension API.
5. Choose supported public APIs and record the version/date, URLs, native symbols, limitations and intended validation in `docs/research.md`. If a hook is absent, investigate supported composition or a custom endpoint. Never invent an API or patch a dependency to match an assumption.

Use owning module services and public workflows for native writes. Cross-module coordination belongs in workflows; module isolation prohibits resolving Product from the template module. SQL, if needed, only touches this module's own tables. Metadata merging, batch/import paths, publication checks and compensation require deliberate verification.

## Admin experience

Use public Admin routes/widgets and Medusa UI components, configured SDK authentication/backend URL and router base paths. Do not import private Dashboard files, alias internals, patch core flows, intercept handlers or hide native UI with DOM/CSS manipulation. Provide loading, empty, error, validation and stale-write states; preserve accessible labels, keyboard navigation and focus. Verify affected journeys with Playwright, inspect screenshots, and check narrow layouts and dark theme. UI visibility is never the authorization boundary.

## Packaging and development

Run Node, npm, Medusa, builds and Playwright inside Docker Compose from this repository root. Do not depend on host Node/npm or host `node_modules`. Keep normal Compose startup and tooling free of unit, integration and browser tests. Tests and their disposable services belong only in explicit `compose.ci.yaml` CI mode. Gate application startup on healthy dependencies and successful one-shot migrations.

Preserve existing development containers, volumes, accounts and data in other projects. Use unique project names, image tags and ports for validation. Never seed fixtures into a merchant's development or production database.

Pin the validated development dependency versions and commit the lockfile. Scope any dependency override narrowly, document why, and prove native generation/build behavior. npm applies overrides only from the consuming root. A source build is insufficient: inspect every declared server/Admin/browser/type export in the packed artifact and perform a clean locked consuming installation and native Admin build. Browser exports must contain ESM rather than CommonJS at an ESM path.

Keep optional integrations optional. Authentication uses Medusa; authorization adapters must enforce server access and be testable without a particular RBAC package. Export explicit public types, configuration, validation and client contracts. Do not publish a release or npm package without a release request.

## Validation and delivery

Use TypeScript, two-space indentation, double quotes, no semicolons and Prettier. Unit/component tests use Vitest; integration tests use dedicated disposable PostgreSQL databases and the real native modules; browser checks use Playwright. Require 100% per-file statements, branches, functions and lines for custom source, excluding generated migrations. Do not weaken coverage or skip a meaningful check to hide a failure.

Validate authorization, product/variant boundaries, type/range/choice constraints, partial drafts versus complete publication, immutable schema history, metadata preservation, stale writes, failure/retry and store publication/channel boundaries. Retain reports and screenshots. Run relevant checks after changes; distinguish local proof, final-head hosted CI and deployment.

Use Conventional Commits, feature branches and reviewable PRs. Default branch is `master`. Commit and push each substantial validated feature/fix. Stage only task-owned files and preserve unrelated work. Follow `abhi1693/actions` for hosted workflow reuse. Public documentation must be professional and describe the plugin's capabilities and limits without merchant-specific branding or inspiration credits. Preserve third-party licensing where code is actually reused.

Never commit credentials, runtime uploads, browser downloads or generated fixtures. Do not add analytics or unrelated commerce features to this plugin.
