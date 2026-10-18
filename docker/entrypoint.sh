#!/bin/sh
# Container start: migrate, seed demo data (SEED=if-empty | reset | never), then run the single server.
set -e
cd /app/apps/api
echo "▸ Migrations"
pnpm exec drizzle-kit migrate
case "${SEED:-if-empty}" in
  reset) echo "▸ Reseeding demo data (SEED=reset)"; node -r @swc-node/register src/db/seed.ts ;;
  never) echo "▸ Seeding skipped (SEED=never)" ;;
  *)     node -r @swc-node/register src/db/seed-if-empty.ts ;;
esac
echo "▸ Starting BTW on port ${PORT:-3101}"
exec node -r @swc-node/register src/main.ts
