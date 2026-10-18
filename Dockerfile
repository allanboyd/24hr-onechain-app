# syntax=docker/dockerfile:1
# BTW platform in one image: the API serves the office web app (/), the field + team app (/app/) and the API (/v1).
#   docker compose up -d --build        → http://localhost:3101  (see docker-compose.yml)
FROM node:20.16-bookworm-slim AS base
ENV CI=true
# npm, not corepack: Node 20.16's bundled corepack has outdated signing keys
RUN npm install -g pnpm@10.13.1
WORKDIR /app

# ---- dependencies (cached until a package.json or the lockfile changes) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/build-tokens.mjs scripts/
COPY docs/design-system/tokens.json docs/design-system/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/field/package.json apps/field/
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/
COPY packages/tokens/package.json packages/tokens/
RUN pnpm install --frozen-lockfile

# ---- build the two front-ends against the same-origin API ----
FROM deps AS build
COPY . .
# VITE_DEMO=1 keeps the one-tap demo accounts on the sign-in screens; build with --build-arg VITE_DEMO=0 for production.
ARG VITE_DEMO=1
RUN pnpm tokens \
 && VITE_API=http VITE_API_URL=/v1 VITE_DEMO=$VITE_DEMO pnpm --filter @btw/web build \
 && VITE_API=http VITE_API_URL=/v1 VITE_DEMO=$VITE_DEMO pnpm --filter @btw/field build

# ---- runtime ----
FROM base AS runtime
# DejaVu fonts for the Typst PDF letters (PO letters, acknowledgements)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core wget && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
RUN chmod +x /app/docker/entrypoint.sh && mkdir -p /app/apps/api/var/files
ENV PORT=3101 NODE_ENV=development PDF_FONT_DIRS=/usr/share/fonts/truetype
EXPOSE 3101
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=5 CMD wget -qO- http://localhost:3101/health || exit 1
ENTRYPOINT ["/app/docker/entrypoint.sh"]
