FROM node:24.21.0-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /plugin
RUN chown node:node /plugin
USER node
COPY --chown=node:node package.json package-lock.json ./
# Bootstrap tooling before plugin sources are ready. The application stage below
# verifies an ordinary clean installation, including the package's prepare hook.
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS tooling
COPY --chown=node:node . .
CMD ["bash"]

FROM tooling AS application
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 npm ci --no-audit --no-fund
RUN node scripts/package-local.mjs \
    && node scripts/install-host.mjs

FROM dependencies AS browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER root
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && npx playwright install --with-deps --only-shell chromium
USER node

FROM browsers AS testing
COPY --from=application --chown=node:node /plugin /plugin
ENV CI=true MEDUSA_DISABLE_TELEMETRY=true
CMD ["npm", "run", "ci:test"]

FROM application AS development
CMD ["npm", "run", "dev"]
