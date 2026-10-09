# BTW Supply Chain Platform

Office web app, a minimal map-first field app (Android) for the three people who handle a consignment — **loading point (giver), driver, receiver** — and a NestJS + PostGIS API.
Both apps run against the **real API** (`VITE_API=http`) or the **in-browser mock** (default) with identical behaviour; business rules live once in `packages/api/src/rules.ts`.

- Requirements, design system, MVP plan: [`docs/`](docs/README.md). Start with [`docs/03-mvp-plan.md`](docs/03-mvp-plan.md).
- API contract: [`docs/api/openapi.yaml`](docs/api/openapi.yaml)

## Layout
```
apps/web        Svelte 5 + Vite SPA (office): plans, POs, loading, shipments, tracking, stock, sales, finance, analytics, master data, users & devices, integrations
apps/field      Svelte 5 + Vite + Capacitor 7 (Android): driver / loading point / receiver, slide-to-confirm, offline outbox, background location
apps/api        NestJS 11 (Fastify) + Drizzle + PostgreSQL 17/PostGIS: auth, scopes, audit, all workflow endpoints, sync, integrations (SMS/USSD, email, push, files, Typst PDF, OSRM)
packages/api    The only module screens import: types, shared rules.ts, mock client, http client (chosen at build time), offline outbox
packages/ui     Shared CSS (tokens only), Badge, CheckpointTimeline, SignaturePad, router, formatters
packages/tokens tokens.css generated from docs/design-system/tokens.json (`pnpm tokens`)
```

## Run (Node 20.16+, pnpm 10, Docker)
```bash
pnpm install
pnpm start             # everything on ONE address: http://localhost:3101
                       #   /  office web app · /app/  field app · /brand/  logo variants · /v1  API · email inbox :18025
pnpm start --reset     # same, with fresh demo data
pnpm dev:all           # same stack with hot reload (web :5173, field :5174, API :3101) in one terminal
pnpm verify            # type-check, workflow + API tests, builds, size budget
pnpm android:build     # debug APK (docs/android.md)
```
Demo sign-in: web `+254700000001` / `demo1234` (director) · field PIN `1234` (driver `+254711000001`, loading point `+254700000003`, receiver `+250700000007`).

## Docs
Build plan and ownership: `docs/04-build-plan.md` · Android: `docs/android.md` · Brand & logo variants: `docs/brand/README.md` · Process: `docs/DEVELOPMENT.md`.
Demo accounts: web password `demo1234`, field PIN `1234` (phones listed on the field sign-in screen in dev).

> Node note: Vite is pinned to v6 because this machine has Node 20.16. Upgrade to Node 22 LTS to move to Vite 8.
