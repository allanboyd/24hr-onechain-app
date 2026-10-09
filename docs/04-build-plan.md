# 04 — Build plan: real API, minimal field app, web on the API

**Decided 7 Oct 2026 (client):**
- **Mobile app:** minimal and map-first (Bolt/Uber style), one task per role, **three roles only**:
  - **Giver**: the loader at the supplier loading point. Also the sender on a transfer leg, e.g. Asie Kigali → Goma.
  - **Driver**
  - **Receiver**: Asie or Zonas.

  Directors, planners, fleet and accounts use the web app.
- **API:** NestJS 11 + PostgreSQL 17/PostGIS 3.5.
- **Integrations:** behind adapters, with local stand-ins until real keys are set in `.env`.
- **Android:** APKs are built on this machine.

## Local environment (fixed; do not change ports)
| Thing | Where |
|---|---|
| API | `pnpm --filter @btw/server dev` → http://localhost:3101 (`/health`, everything else under `/v1`) |
| Postgres + PostGIS | `docker compose up -d db` → `postgres://btw:btw@localhost:55433/btw` |
| Mailpit (email inbox) | SMTP `localhost:11025`, UI http://localhost:18025 |
| Web / field dev | http://localhost:5173 / http://localhost:5174 |
| Android | `JAVA_HOME=$HOME/.local/opt/jdk-21`, `ANDROID_HOME=$HOME/Android/Sdk` (installed by `scripts/setup-android.sh`) |

Other projects run containers on this machine, on ports 3000, 5432, 5433, 1025, 8025 and 8000. Never stop, remove or prune containers or volumes you didn't create, and never run `docker compose down -v`.

Node is **20.16**. NestJS 12 and Nest CLI 12 need Node ≥ 20.19, so we pin NestJS 11 and run TypeScript with SWC (`node --watch -r @swc-node/register`).

## Ownership (one owner per path, so agents never edit the same files)
| Agent | Owns | Must not edit |
|---|---|---|
| **api-core** | `apps/api/src/**` except `integrations/`, `apps/api/drizzle/`, `apps/api/test/`, `packages/api/**` (types, client switch, `http.ts`, mock, outbox, workflow test), `docs/api/openapi.yaml` | `integrations/`, apps |
| **api-integrations** | `apps/api/src/integrations/**`, `apps/api/templates/**` (Typst), `docker-compose.yml` (add services only) | feature modules, schema |
| **field-app** | `apps/field/src/**` (minus `native/`), `apps/field/index.html`, `tools/mockups/flows/d-*.mjs`, `e-*.mjs` + `flows.mjs` entries D/E | `apps/field/android`, `capacitor.config.ts`, `packages/*` |
| **mobile-platform** (+ brand) | `docs/brand/**`, `packages/ui/src/assets/brand/**`, `apps/field/src/native/**`, `apps/field/android/**`, `apps/field/capacitor.config.ts`, `apps/field/resources/**`, Capacitor deps in `apps/field/package.json`, `scripts/setup-android.sh`, `.github/workflows/android.yml` | `apps/field/src` outside `native/` |
| **web** | `apps/web/**`, `tools/mockups/flows/a-*.mjs`, `b-*.mjs`, `c-*.mjs` | `packages/*` (request API changes from api-core in your report) |

`packages/ui` is frozen except for the brand assets folder. A UI need goes into the app's own `components/`.

## Contracts everyone codes against
1. **Types:** `packages/api/src/types.ts`. Additive changes only, made by api-core.
2. **Client:** screens import only `@btw/api`. api-core turns `packages/api/src/index.ts` into a switch:
   - `VITE_API=mock` (default; today's mock, unchanged behaviour)
   - `VITE_API=http` (new `http.ts` with the **same exports**, base URL `VITE_API_URL`, default `http://localhost:3101/v1`, bearer token, refresh on 401)

   Auth calls also exist in mock form: `auth.login({ username, password } | { phone, pin })`.
3. **Demo accounts** (seeded identically in the mock and the DB):
   - Every user in `mock/seed.ts`.
   - Web password `demo1234`; field PIN `1234`.
   - Phone numbers are the login for field users.
4. **Field roles:** `loader` (shown as "Loading point"), `driver`, `receiver`. Any other role signing in to the field app sees "Use the web app" plus a link.
5. **Native services** (mobile-platform writes `apps/field/src/native/index.ts`; field-app calls only these, and each has a browser fallback):
   ```ts
   getPosition(): Promise<{lat,lng,accuracyM}|null>
   startTracking(opts:{legId:string; nextCheckpoints:{id,lat,lng,radiusM}[]}, onEvent:(e:{type:'ping'|'enter'|'exit', checkpointId?:string, lat,lng,at:string})=>void): Promise<void>
   stopTracking(): Promise<void>
   takePhoto(): Promise<{name:string; dataUrl:string}|null>   // compressed ~1600px/70%
   registerPush(onToken:(t:string)=>void, onMessage:(m:{title,body,data})=>void): Promise<void>
   network: { online(): boolean; onChange(cb:(online:boolean)=>void): () => void }
   secureStore: { get(k):Promise<string|null>; set(k,v):Promise<void>; remove(k):Promise<void> }
   haptic(kind:'success'|'warning'|'tap'): void
   isNative: boolean
   ```
6. **Brand assets:** `packages/ui/src/assets/brand/`, using the names listed in `docs/brand/README.md`. Both apps reference them from there.

## Done means
- `pnpm verify` is green.
- api-core adds `pnpm --filter @btw/server check` and `test` to `verify`, with the HTTP workflow test running against a migrated, seeded DB.
- `pnpm mockups` is green.
- Nothing is committed: changes stay in the working tree, and the owner reviews them with `git diff`. The baseline is staged in the index.
