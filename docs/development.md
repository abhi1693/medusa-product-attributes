# Development and validation

Run every application command from the repository root through Docker Compose. Host Node/npm and host `node_modules` are not required.

## Local Admin

Copy `.env.example` to `.env` and set independent `JWT_SECRET` and `COOKIE_SECRET` values of at least 32 characters. Do not commit this file.

```sh
docker compose up --build dev
```

The startup sequence builds and packs the plugin, installs the exact archive in the included Medusa host, waits for healthy PostgreSQL/Redis, and completes native migrations before starting the backend. It does not run tests. The Admin is available at `http://localhost:19001/app`; the development HMR port defaults to 15174.

Create the first administrator through the included host's explicit RBAC bootstrap command. Supply credentials through temporary environment variables:

```sh
read -r RBAC_SUPERUSER_EMAIL
read -rs RBAC_SUPERUSER_PASSWORD
export RBAC_SUPERUSER_EMAIL RBAC_SUPERUSER_PASSWORD
docker compose --profile tools run --rm \
  -e RBAC_SUPERUSER_EMAIL -e RBAC_SUPERUSER_PASSWORD cli npm run bootstrap
unset RBAC_SUPERUSER_EMAIL RBAC_SUPERUSER_PASSWORD
```

Use a password of at least 12 characters. Bootstrap creates the native user/identity and explicitly assigns Superuser; existing credentials are preserved when no password is supplied. It does not create ordinary roles or assign other accounts. The plugin itself has no RBAC dependency; the included host deliberately installs RBAC and Admin Kit for compatibility validation.

Open **Settings → Product attributes** to create a template. Assign it in a product's **Specifications** widget. Variant fields are edited on the native variant detail page. Draft specifications can be incomplete; complete required fields before publishing.

Database schema updates use the one-shot migration service:

```sh
docker compose run --rm --build migrate
```

Use a separate project name and different ports when running another copy. Never remove a merchant application's volumes or seed its database for plugin validation. The included fixture seed rejects non-CI, non-local and non-disposable databases.

## Tooling and package inspection

```sh
docker compose --profile tools run --rm --build --no-deps tooling npm run format:check
docker compose --profile tools run --rm --build --no-deps tooling npm run typecheck
docker compose --profile tools run --rm --build --no-deps tooling npm run pack:local
```

The package includes built server code, declarations, native Admin entries and an ESM/CJS client. Package checks verify declared export paths. The application image performs an ordinary root installation with lifecycle scripts, creates a consumer lock for the exact built archive, and runs a clean consumer `npm ci`. The compatibility host's dependencies stay in Docker.

The host installer clears only this fixture's installed dependencies and generated lock before creating its new lock. This prevents npm's hidden installed-package lock from retaining an older integrity when an unreleased local archive is rebuilt at the same path/version. Published package versions remain immutable.

## Explicit CI mode

Test services exist only in `compose.ci.yaml`. Ordinary startup, Watch and tooling do not start tests or test databases.

```sh
docker compose -f compose.yaml -f compose.ci.yaml --profile ci build test
docker compose -f compose.yaml -f compose.ci.yaml --profile ci run --rm test npm run typecheck
docker compose -f compose.yaml -f compose.ci.yaml --profile ci run --rm test npm run format:check
docker compose -f compose.yaml -f compose.ci.yaml --profile ci run --rm test npm test
docker compose -f compose.yaml -f compose.ci.yaml --profile ci run --rm test npm run test:integration
docker compose -f compose.yaml -f compose.ci.yaml --profile ci run --rm test npm run test:e2e
```

Integration and browser runners create a random disposable database on the isolated local PostgreSQL service and remove it after execution. The service network is internal; it cannot resolve the merchant's database. Tests use the built plugin installed in a real consuming application, with native modules and migrations. Native user identities are random test-only credentials saved in ignored artifacts.

Vitest requires 100% statements, branches, functions and lines per custom source file, excluding generated migrations. Browser validation covers the native login, template authoring, product and variant specifications, denied writes, schema evolution, stale writes and adjacent native pages. Review screenshots in `test-results/`, traces/HTML reports and server logs in `artifacts/` when investigating a failure. Retain reports before removing the test container.

The hosted CI uses Docker Compose for application execution and reuses `abhi1693/actions` for shared checks. A passing local run does not certify a later commit, hosted CI or a production deployment. Recheck the final pushed head.

## Validated preview checkpoint

The [2026-10-30 CI checkpoint](https://github.com/abhi1693/medusa-product-attributes/actions/runs/41100806820) validates implementation commit `bb8e41bfbf2250124f6aefc5b1e9cceddb72fcd9` with a clean packed consuming installation, native server/Admin build, all 22 public export targets, 133 unit/component tests at 100% per-file coverage, native PostgreSQL integration and five browser journeys.

Native regression checks cover specification survival after unrelated native compensation, atomic initialization, failed partial link creation and retry, native delete/restore, current-pointer conflicts, metadata-export isolation and editable-definition seed replay. Subsequent local browser validation also covers all five field types and six raw native Admin/Store relation-disclosure probes. The images in the README come from those real native Admin journeys. Application acceptance and npm publication remain separate gates.
