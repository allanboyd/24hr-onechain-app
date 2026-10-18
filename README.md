# BTW Supply Chain Platform

Office web app, a minimal map-first field app (Android) for the three people who handle a consignment — **loading point (giver), driver, receiver** — an installable **team phone app (PWA)** for office roles at `/app/`, and a NestJS + PostGIS API.
Both apps run against the **real API** (`VITE_API=http`) or the **in-browser mock** (default) with identical behaviour; business rules live once in `packages/api/src/rules.ts`.

- Requirements, design system, MVP plan: [`docs/`](docs/README.md). Start with [`docs/03-mvp-plan.md`](docs/03-mvp-plan.md).
- API contract: [`docs/api/openapi.yaml`](docs/api/openapi.yaml)

## Layout
```
apps/web        Svelte 5 + Vite SPA (office): plans, POs, loading, shipments, tracking, stock, sales, finance, analytics, master data, users & devices, integrations
apps/field      Svelte 5 + Vite + Capacitor 7 (Android): driver / loading point / receiver, slide-to-confirm, offline outbox, background location;
                src/team = team PWA for office roles (bottom tabs per role, side drawer, home menu + KPIs + "Needs attention")
apps/api        NestJS 11 (Fastify) + Drizzle + PostgreSQL 17/PostGIS: auth, scopes, audit, all workflow endpoints, sync, integrations (SMS/USSD, email, push, files, Typst PDF, OSRM)
packages/api    The only module screens import: types, shared rules.ts, mock client, http client (chosen at build time), offline outbox
packages/ui     Shared CSS (tokens only), Badge, CheckpointTimeline, SignaturePad, router, formatters
packages/tokens tokens.css generated from docs/design-system/tokens.json (`pnpm tokens`)
```

## What's new (18 Oct 2026)
- **Period plans are suggestions** — no approval; statuses Active / Replaced; Active plans of a company never overlap (the app offers *Replace*); plans don't gate POs. See [`docs/09-plans-po-revisions.md`](docs/09-plans-po-revisions.md).
- **PO approval is a switch** — `[approvals] purchase_orders` in `apps/api/config.toml` (default `false`): planners tap *Issue purchase order* and the letter says ISSUED. Set `true` for director approval.
- **Loading allowance and PO revisions** — the loader loads from the PO within ±`allowance_pct` (10 %), may load alternatives; any difference auto-creates `<PO ref>-rev001`, `-rev002`, … (numbered from the original); shipments follow the latest revision.
- **Truck planner role** — onboards providers / saccos / trucks / drivers, orders the loading queues, Truck desk (`#/trucks`), expenses per truck and provider. See [`docs/10-truck-planner-role.md`](docs/10-truck-planner-role.md).
- **Team phone app (PWA)** — office roles sign in at `/app/` with phone + PIN and get bottom tabs per role: director Home·Trucks·Orders·Money·More, planner Home·Trucks·Orders·Stock·More, accounts Home·Trucks·Orders·Money·More, truck planner Home·Queue·Trucks·Money·More. Field roles are unchanged.

## Settings (`apps/api/config.toml`)
Read by the API at start-up (restart after a change; `CONFIG_FILE=/path` to use another file; defaults apply if missing). Apps receive them in `GET /v1/ref` as `config`.
```toml
[approvals]
purchase_orders = false     # true = a director must approve a PO before it is issued
[loading]
allowance_pct = 10          # ± % a truck's loaded total may differ from the PO
allow_alternatives = true   # loader may load substitute products from the same supplier
revision_suffix = "-rev"    # PO-001 → PO-001-rev001, -rev002, …
```

## Run with Docker only (no Node needed)
```bash
docker compose up -d --build      # or: pnpm docker:up — builds the image, starts db + email + app
                                  # → http://localhost:3101  (/ web · /app/ phone app · /v1 API) · inbox http://localhost:18025
docker compose logs -f app        # pnpm docker:logs
SEED=reset docker compose up -d --force-recreate app   # fresh demo data (pnpm docker:reset)
docker compose down               # stop (data is kept in the `db` volume; add -v to wipe it)
```
Options (env vars or a `.env` file next to `docker-compose.yml`): `APP_PORT` (host port, default 3101), `PUBLIC_URL`,
`JWT_SECRET`, `NODE_ENV=production` (hides demo sign-in and dev tools), `SEED=if-empty|reset|never`, `VITE_DEMO=0` (build
without the one-tap demo accounts), and the integration keys from `apps/api/.env.example` (`AT_API_KEY`, `FCM_SERVICE_ACCOUNT`, …).
`apps/api/config.toml` is mounted into the container — edit it and run `docker compose restart app`.

## Run per folder (Node 20.16+, pnpm 10 via `corepack enable`)
Install once from the repo root: `pnpm install`. Then, inside each folder, `pnpm <script>` (or `npm run <script>`):

| Folder | Script | What it does |
|---|---|---|
| `apps/api` | `bootstrap` | start Postgres + email (Docker), migrate, seed demo data if empty |
| | `dev` / `start` | API on http://localhost:3101 (watch / once) — also serves built web + field apps |
| | `db:migrate`, `db:reset`, `db:seed:if-empty`, `db:up` | database helpers |
| | `test`, `test:qa` | API e2e and QA suites |
| `apps/web` | `dev` | office web app on :5173 with the in-browser mock (no API needed) |
| | `dev:live` / `build:live` | same, against the API on :3101 (proxied `/v1`) |
| `apps/field` | `dev` | field + team phone app on :5174 with the mock |
| | `dev:live` / `build:live` | same, against the API |

## Run everything from the root (Node 20.16+, pnpm 10, Docker)
```bash
pnpm install
pnpm bootstrap         # database + email in Docker, migrations, demo data
pnpm start             # everything on ONE address: http://localhost:3101
                       #   /  office web app · /app/  field app · /brand/  logo variants · /v1  API · email inbox :18025
pnpm start --reset     # same, with fresh demo data
pnpm share             # same as start + a public ngrok link for demos (one-time: ngrok config add-authtoken <TOKEN>)
                       #   SHARE_DOMAIN=<your>.ngrok-free.app for a stable link · SHARE_AUTH=user:pass to password-protect it
pnpm dev:all           # same stack with hot reload (web :5173, field :5174, API :3101) in one terminal
pnpm verify            # type-check, workflow + API tests, builds, size budget
pnpm android:build     # debug APK (docs/android.md)
```
Demo sign-in: web `+254700000001` / `demo1234` (director) · field PIN `1234` (driver `+254711000001`, loading point `+254700000003`, receiver `+250700000007`).
Truck planners: `btw-trucks` (+254700000017, BTW / KBL) and `trucks` (+254700000018, all companies) — web password `demo1234`.
Office team on a phone: open `/app/` and sign in with the user's phone + PIN `1234` (e.g. director `+254700000001`, truck planner `+254700000017`).

## Docs
Build plan and ownership: `docs/04-build-plan.md` · Android: `docs/android.md` · Brand & logo variants: `docs/brand/README.md` · Process: `docs/DEVELOPMENT.md`.
Demo accounts: web password `demo1234`, field PIN `1234` (phones listed on the field sign-in screen in dev).

> Node note: Vite is pinned to v6 because this machine has Node 20.16. Upgrade to Node 22 LTS to move to Vite 8.
