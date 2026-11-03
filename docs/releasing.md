# Release procedure

Releases require an explicit maintainer decision. Development validation and archive generation do not publish a package.

1. Merge the reviewed change into `master`, pin the intended semantic version in `package.json` and the lockfile, and write `docs/releases/<version>.md`.
2. Verify the final commit's complete CI: formatting, types, package/publisher checks, per-file coverage, native PostgreSQL lifecycle, packed consumer/Admin build and Playwright. Review screenshots and logs.
3. Dispatch **Prepare release** from the exact reviewed source. It reruns CI, verifies the archive's declared exports and README assets, creates SHA-256 checksums and provenance, and creates a draft GitHub release. Review its source, notes and downloaded asset checksums.
4. Publish the reviewed draft. **Publish to npm** validates the exact release/tag source and provenance, then publishes the existing archive. It does not rebuild a different package for npm.
5. Verify the registry version, tarball checksum/integrity, package installation, GitHub release assets and native consuming behavior. Report these states separately.

## npm authentication

Configure a trusted publisher for `abhi1693/medusa-product-attributes`, workflow filename `publish.yml`, using the package's npm settings. Trusted publishing uses GitHub OIDC and avoids a permanent npm token. This repository's trusted publisher is independent of any other package's configuration.

A first publication may require npm's package-creation/bootstrap process before a trusted connection is available. Handle any temporary credential through repository Actions secrets, never source files, command arguments or logs. Remove it after the trusted publishing flow is established. No publishing credential is required for normal CI or local development.

Registry publication and normal installability are separate states. The publishing helper submits at most once, then polls for version metadata, verifies the exact downloaded bytes and waits for normal registry visibility. Recovery verifies an already-published immutable version rather than republishing different bytes. Run recovery from the matching tag; do not reuse a version for changed contents.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [GitHub artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds).
