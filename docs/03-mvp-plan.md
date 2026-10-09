# 03 — MVP Plan: research, architecture, tracking design and delivery

**Inputs:** `01-requirements-summary.md`, `02-design-system.md`, the requirements document v0.3, and online research done on 7 October 2026 (sources in §10).
**Status:** Proposal. The stack and scope decisions in §2 and §6 need sign-off. Open questions from `01` §5 still apply. The ones that block the MVP are repeated in §9.
**Working prototype:** `apps/web` and `apps/field` (see `README.md` at the repo root). Every screen in §7 exists there with mock data and no backend.

---

## 1. What "MVP" means here

Three deliverables share one backend:

| Deliverable | Who uses it | What it must do at go-live |
|---|---|---|
| **API** (one backend, all business rules) | Both apps, later integrations | Auth and scoped RBAC, master data, plan → approval → PO, loading, shipments and legs, checkpoint events, acknowledgement → stock, sales, trip costs, analytics, notifications, offline sync endpoint |
| **Web app** (office) | Directors, planner (Kabonge), operations/fleet (Tesfie), accounts, admin | Full workflow, dashboards, PO letter PDF, exports |
| **Field app** (Android first, iOS from the same code) | Drivers, loaders at loading points (Joel, Eric, Moses, Tesfie), receivers (Asie, Zonas), directors on the go, sales | Only the field tasks: check-in at checkpoints, report issues, record loading, acknowledge with photos and signature, approve, look up stock, quick sale. **Works offline.** |

The field app is a **separate, smaller build**, not the web app squeezed onto a phone. It shares the design tokens, components and API client with the web app, but compiles only the field screens. No admin, planning editor, master data or heavy reports go into it.

**MVP test (from §16 of the requirements):** one real multi-leg shipment (Nairobi → Kigali → Goma) runs from plan to final acknowledgement with reconciled quantities. The PO matches the paper letter layout and totals. Velocity classes match a manual calculation. Offline capture works on agreed Android phones.

---

## 2. Stack decision (the "very light" requirement)

### 2.1 Recommendation

| Layer | Choice | Why |
|---|---|---|
| Web frontend | **Svelte 5 + Vite**, a plain SPA with a hash router (no SSR) | Svelte compiles away its framework, so its runtime is about **2–5 KB gzipped**. React 19 is about 42 KB and Vue about 34 KB. In js-framework-benchmark, Svelte runs within about 5% of vanilla JS. The prototype's **whole web app, including all mock data, is about 46 KB gzipped**. An internal, logged-in tool doesn't need SSR. |
| Field app | **Same Svelte code, separate Vite build, wrapped in Capacitor 8** (Android and iOS) | Shares components and skills with the web app. The APK is small: my estimate is 5–10 MB, versus 20–40 MB for React Native and 15–20 MB for Flutter (estimates only, not verified). Native plugins cover background GPS, SQLite, camera and push. |
| Charts | Small SVG components for KPIs and sparklines; **uPlot** (about 45 KB) loaded only on analytics pages | No chart library on the critical path |
| Maps | **Leaflet** (about 40 KB) or MapLibre, loaded only on the tracking screen. **OpenStreetMap** data through a self-hosted **Protomaps PMTiles** file of East Africa (one file on S3 or R2, no tile server, no per-view fees, can be cached offline in the field app) | No Google Maps billing |
| Icons, fonts | Lucide (tree-shaken, about 1 KB per icon). Inter and Montserrat variable fonts **bundled** so the field app renders offline | Matches `02-design-system.md` |
| Backend | **TypeScript: NestJS (Fastify adapter) + PostgreSQL 16 + PostGIS**, Drizzle ORM, **pg-boss** job queue (inside Postgres, no Redis) | One language from database types to screens. Nest gives structure for about 15 modules. PostGIS does geofence checks on the server (`ST_DWithin` / `ST_Contains`). |
| Files | S3-compatible object storage (photos, signatures, PO PDFs), with presigned uploads | Photos never pass through the API process |
| PDF | **Typst** (single binary, renders in milliseconds, JSON in, PDF out) for the PO letter and acknowledgement PDF | Chromium-based options (Puppeteer, Gotenberg) are a Docker image of about 450 MB or more and use far more memory |
| Reporting store | A separate `reporting` schema (or a read replica) with summary tables rebuilt by pg-boss jobs | §11: dashboards never query live tables. The schedule follows Q-P10. |
| Notifications | FCM push; email via SES or Postmark; SMS and USSD through **Africa's Talking** (about KES 0.4–0.8 per SMS in Kenya); WhatsApp Cloud API for digests later | |
| Hosting | One region close to East Africa: AWS af-south-1 (Cape Town), or the Oracle OCI Nairobi region via iXAfrica if Q-I3 requires data to stay in Kenya | Kenya DPA: commercial logistics data may be hosted abroad with transfer safeguards and a DPIA; ODPC registration is required |

**Alternatives I considered:**
- **React Native/Expo:** the biggest hiring pool, but heavier. You would need two UI codebases or React on the web.
- **Flutter:** good performance, but it means a separate language for the mobile app.
- **A pure PWA:** I rejected it for drivers. **A PWA cannot track GPS once the driver switches to another app**, and iOS is worse. It is still fine for directors and sales on the web.
- **HTMX:** too limited for offline use and the rich tables we need.
- **Django + DRF/GeoDjango:** a valid backend if the team prefers Python. The frontend plan doesn't change.

### 2.2 Performance budget (enforced in CI)
| Target | Budget |
|---|---|
| Web initial JS (gzipped) | ≤ 120 KB. The map, charts and PDF preview load lazily. |
| Field app initial JS (gzipped) | ≤ 80 KB |
| Field app APK | ≤ 15 MB |
| Time to interactive, field app on a mid-range Android phone (e.g. Samsung A15) on 3G | ≤ 3 s |
| Photo upload | Compressed on the device to about 1600 px longest edge and about 70% JPEG quality (≈ 200–350 KB) before it is queued (MA-10) |
| Lists | Server-side pagination and filtering. Virtualise tables over 200 rows. |

---

## 3. Architecture

```
 ┌───────────── apps/web (Svelte SPA) ─────────────┐   ┌──── apps/field (Svelte + Capacitor) ────┐
 │ planner · director · ops/fleet · accounts · admin│   │ driver · loader · receiver · director    │
 └───────────────┬─────────────────────────────────┘   │ SQLite outbox · BG geolocation · camera  │
                 │ HTTPS JSON (OpenAPI contract)        └──────┬────────────────────┬──────────────┘
                 ▼                                             │ /sync (batched,     │ SMS / USSD
 ┌──────────────────────── API (NestJS, modular monolith) ─────▼──── idempotent) ───▼ (Africa's Talking
 │ auth+scopes │ masterdata │ planning │ po │ loading │ shipments+tracking │ ack │ inventory │ sales │      webhook)
 │ finance │ analytics │ notifications │ documents │ audit (every write: user, time, channel)              │
 └──────┬───────────────────────┬──────────────────────┬────────────────────────┬────────────────────────┘
        ▼                       ▼                      ▼                        ▼
  PostgreSQL + PostGIS     pg-boss jobs           Object storage           FCM · email · SMS
  (operational schema)     ETA, geofence,         photos, signatures,
        │                  flags, digests,        PO / ack PDFs (Typst)
        └──── scheduled ETL ────► reporting schema (facts + dims) ──► dashboards, exports
```

**Rules that live only on the server (§12):** amount = qty × price; PO numbering; approval locking and amendments; truck-capacity check; stock posts only on acknowledgement; sale blocked above stock unless overridden; payment-approval threshold; leg-status and shipment-status derivation; ETA; velocity classes and flags. The prototype's mock (`packages/api/src/mock/db.ts`) implements the same rules so the screens behave the same way. Treat it as the **executable spec** for the backend team.

**Scope on every record:** `entity_id`, `loading_point_id`, `warehouse_id` and `receiving_company_id` where they apply. A single policy layer filters every query by the user's scopes (UA-02, §17.7).

---

## 4. Checkpoint-based tracking (the core of the field app)

Your idea of "tracking by checking the points the truck reaches" is the right MVP. It works with no GPS hardware integration, on cheap phones, offline, and even for drivers without the app. Live GPS becomes an add-on, not a dependency.

### 4.1 Model
- **Checkpoint**: a named point with a kind (loading point, weighbridge, town, **border**, warehouse), coordinates and a **geofence radius**. Border posts need a large radius (1.5–2.5 km) because the queues are long.
- **Route**: an ordered list of checkpoints. Each one has a **planned arrival offset (hours from departure)** and a **planned dwell** (border dwell dominates). Each **leg** of a shipment follows one route. The seed routes in the prototype cover all the lanes in §17.2:
  - NBO-KGL: KBL → Gilgil WB → Eldoret → Webuye WB → **Malaba** → Kampala → Mbarara → **Katuna/Gatuna** → Kigali
  - NBO-GOM: Kigali → **Gisenyi/Goma** → Goma
  - NBO-JUB: … Kampala → Gulu → **Elegu/Nimule** → Juba
  - MSA-KGL / MSA-JUB: GBI Mombasa → Mariakani WB → Voi → Athi River WB → …
  - MWZ-KGL: SBL Mwanza → Nyakanazi → **Rusumo** → Kayonza → Kigali
  - KGL-JUB: the Asie re-export lane
- **Checkpoint pass**: `arrivedAt` and `departedAt`, plus a **source**: `driver` (button tap), `geofence` (automatic), `gps-provider`, `sms`, or `office` (entered for a driver). The source is always shown, so automatic entries can be told apart from claimed ones.
- **Truck issue** (§17.5): place or checkpoint, reason, time stopped, date fixed, new due date. An open issue with a new due date overrides the ETA.

### 4.2 How a check-in can happen (each tier works on its own)
| Tier | How | Phase | Notes |
|---|---|---|---|
| T0 | Driver taps **"Arrived at Malaba"** / **"Departed Malaba"** in the app (works offline, queued) | MVP | The app only offers the next checkpoint, so it takes one tap |
| T0 | **SMS/USSD** for drivers without data or the app: `ARR MALABA KDA123A` to a shortcode, or a USSD menu | MVP | Covers market (non-regular) trucks (Q-R3). Africa's Talking two-way SMS and USSD. |
| T0 | Office/fleet follow-up (Tesfie) enters it after a phone call | MVP | Source = office |
| T1 | **Geofence auto check-in**: the phone registers only the **next 2–3 checkpoints** and records arrival and departure automatically | Phase 2 (pilot in MVP) | Stays under the Android limit of 100 geofences and the iOS limit of 20 regions. The server re-checks with PostGIS. |
| T1 | **Low-frequency GPS pings**: every 5–15 min while moving, 50–200 m distance filter, paused when stationary, uploaded in batches | Phase 2 | About 100 bytes per point, so ≤ 1 MB per truck per day. Arrival and departure events are sent at once; pings are batched. |
| T2 | **Tracking-provider API** for trucks that already have trackers (Q16) | Phase 2 | Positions go into the same pipeline as pings, and the same geofence engine produces passes |

**Background GPS plugin:**
- Start with `@capacitor-community/background-geolocation`. It is free. It needs an Android foreground service, POST_NOTIFICATIONS, `useLegacyBridge`, and native HTTP for uploads.
- Pilot Capawesome's new Background Geolocation plugin, released 25 Sept 2026. It is paid, has a native SQLite queue, and supports devices without Google Play Services.
- **Transistorsoft** is the proven fallback (one-off licence from $399; release builds on Android need a licence).

### 4.3 ETA rule (TR-04), simple and explainable
```
delay_h      = actual_departure(last passed checkpoint) − (planned_arrival + planned_dwell)
               (still at the checkpoint → max(now, arrival + planned dwell) is used as departure)
ETA          = planned_final_arrival + delay_h
if open issue with new due date → ETA = max(ETA, new due date)
state        = Late if delay > 1 h · Early if < −1 h · otherwise On time   (thresholds configurable)
```
- **Seed values:** route hours in the prototype are estimates. Replace them with the client's own experience and with Northern Corridor Transport Observatory benchmarks.
- **Improvement after go-live:** a nightly job recomputes each segment's travel time and each checkpoint's dwell as **historical medians (P80 for "late")** per lane. The ETA then gets better without code changes.
- **Alerts (TR-05):**
  - Late by more than X hours.
  - Long stop: at a checkpoint longer than planned dwell + Y hours.
  - **No check-in**: next checkpoint overdue and no ping. This is the most useful alert for the T0 tiers.
  - Geofence entry and exit at borders and warehouses.

---

## 5. Offline sync (MA-06) without a sync engine
Driver, loader and receiver data is mostly **append-only events**: checkpoint passes, issues, loadings, acknowledgements, sales. So the MVP uses a **transactional outbox** rather than full two-way database sync. PowerSync is the upgrade path if two-way offline editing is ever needed.

1. Each write gets a device-generated **idempotency key** (UUID v7) and a device timestamp. It is stored in SQLite (the prototype uses localStorage) and shown in the **sync chip** (`Synced` / `Pending n` / `Offline`).
2. When the device is online, the outbox is sent in order to `POST /sync/batch`. The server applies each item with `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` and returns a result for each item.
3. Photos and signatures upload separately with presigned and resumable uploads, and the event refers to them by ID. The event is never blocked waiting for its photo.
4. **Conflicts** (Q-P8):
   - Events don't conflict.
   - For the rare editable records (stock-take count vs a sale), the **server rejects the change and the user resolves it**. The item stays in the outbox with an error, which the prototype already shows.
5. **Read cache:** each role downloads only its own working set: the driver's active legs and route checkpoints, the loader's queue, the receiver's incoming legs and stock. It refreshes incrementally with `?since=`.
6. **MA-11:** the app sends `X-App-Version`. The API rejects versions below the minimum with `426`, and the app shows a "please update" screen.

---

## 6. MVP scope and plan (3 Oct 2026 → early Jan 2027)

The requirements put everything into the 3 months. That is not realistic for every module at full depth (Q-T1). I propose **one go-live with three internal milestones**, and moving the items marked ⏭ to a follow-on release.

| Milestone (end date) | Backend | Web | Field app |
|---|---|---|---|
| **M0 — Agree (17 Oct)** | Repo, CI, environments, auth + scoped RBAC, audit, master data import from Excel | **Sign-off of this prototype's screens.** Answers to the §9 questions. | Capacitor shell builds and installs on test phones |
| **M1 — Order to truck (14 Nov)** | Plans/approval/amendments, PO numbering and **Typst PO PDF**, loading + waiting list, shipments and legs, checkpoint passes (driver, office, SMS), truck issues, notifications (in-app, push, email) | Plans, approvals, PO letter, loading, shipments, shipment detail | Login + PIN, driver check-ins and issues, loader recording with photos, **offline outbox**, push |
| **M2 — Truck to stock to sale (12 Dec)** | Acknowledgement → stock ledger, discrepancy alerts, inventory, sales with stock blocking, trip costs, payments with approval threshold, **landing cost per truck**, reporting schema and jobs, velocity and flags, exports | Inventory, sales, trip financials, velocity analytics, dashboard, tracking map (checkpoints + pings) | Receiver acknowledgement with signature, stock lookup, quick sale, director approvals and flags. **Geofence + GPS pilot on 2–3 trucks.** |
| **M3 — Acceptance & go-live (by 9 Jan)** | Hardening, backups and restore test, load test, security review, DPIA | UAT with the 3 sample orders, the multi-leg test shipment, and the velocity check against the manual sample | Pilot on agreed devices, store/MDM release |

**Moved to the follow-on release (⏭):**
- Management accounts for Asie and Zonas: P&L, retained earnings, dividends. The MVP records their expenses and stock value only (Q-P6).
- Integration with the tracking provider's API (T2).
- Route-deviation alerts.
- WhatsApp digests.
- Stock transfers and stock take (IN-03/04).
- Accounting export (FN-04).
- Batch and expiry tracking (IN-06).
- French and Swahili interface (Q-I5).
- Two-factor authentication (UA-04, a "should").

**Calendar risk:** M3 falls over Christmas and New Year, and the borders are at their busiest. Plan UAT for the week of 14 Dec, and keep the go-live in January as a fallback.

**Suggested team:**
- 1 tech lead / backend
- 1 backend
- 1 frontend (web)
- 1 frontend (field + Capacitor)
- part-time designer/QA
- the client's product owner (for questions and UAT)

---

## 7. Screens: prototype inventory (no backend)

Run `pnpm dev:web` (port 5173) and `pnpm dev:field` (port 5174). Sign in as any demo role. Everything persists in the browser, and **Reset demo data** restores the seed.

| Stage (§6) | Web screen | Field screen | Roles |
|---|---|---|---|
| — | Dashboard: KPIs, trucks in transit with ETA, flags, approvals | Director home: approvals, flags, trucks | Director |
| 1–2 Planning, approval | Plans list · New plan · **Plan editor** (truck lines, mixed loads, subtotals per truck and per brand/package, grand total, capacity check) · Approve with signature, return, reject | Approvals inbox → plan → approve with signature | Planner, Director |
| 3 PO | PO list · **PO letter** (letterhead, table, totals, signature, print/PDF, mark sent) | — | Planner, Ops |
| 4 Loading | **Waiting list** per loading point + record loading (truck from queue, driver, loaded vs ordered, agreed transport price, documents) | Loader: queue, record loading with photos | Loaders, Fleet |
| 5–6 Dispatch, tracking | Shipments list · **Shipment detail** (legs, checkpoint timeline, ETA, issues, reconciliation between legs, add a transfer leg) · **Tracking map** | **Driver: "Arrived at / Departed" next checkpoint, report issue, share location, SMS fallback** | Ops, Fleet, Driver |
| 7 Acknowledgement | Shown on the shipment | **Receiver: incoming → per-brand received/damaged → photos → signature** | Asie, Zonas |
| 8 Inventory | Inventory (§7.5 columns, in-transit, landed cost, ledger) | Stock lookup | Receivers, Sales |
| 9 Sales | Sales list + new sale (stock-blocked, override for directors) + balances | Quick sale | Sales |
| 10 Analytics | **Velocity table + heatmap + flags** (§9) | Flags summary | Director |
| Finance | Trip financials, payments and approvals, **landing cost per truck** | Payment approvals | Accounts, Director |
| Admin | Master data: products, suppliers, providers → trucks → drivers, **routes and checkpoints** | — | Admin, Kabonge |
| — | Notifications | Alerts · **Sync / outbox** · Profile | All |

---

## 8. How the frontend switches to the real backend
1. **Contract first:** `docs/api/openapi.yaml` describes every endpoint the screens use. The type names match `packages/api/src/types.ts`.
2. Screens import **only** `@btw/api`. Today that module calls `mock/db.ts`. Next we add `http.ts`, which implements the same functions with `fetch()` and types generated from OpenAPI with `openapi-typescript`, and select between them with `VITE_API=mock|http`. No screen changes.
3. Until each backend module is ready, the frontend runs against a **Prism mock server** of the same OpenAPI file, so the contract is tested from both sides.
4. The mock's business-rule functions (ETA, velocity, stock posting, approval locking) become the **acceptance tests** for the backend: same inputs, same outputs.

---

## 9. Decisions needed now (blocking M0/M1)
1. **Stack sign-off:** Svelte + Capacitor + NestJS/Postgres (§2), or does the team have a React or Python preference (Q-G1)?
2. **One field app with role-based tabs** (the prototype's approach), or separate driver and receiver apps (Q-G2)? One app is cheaper to build and release.
3. **Market-truck drivers** (Q-R3): an app account, SMS check-ins, or office entry only?
4. **Existing GPS trackers on trucks?** If yes, which provider and do they have an API (Q16)? This decides how important T2 is.
5. **Intermediate stock** (Q-P1): the prototype treats an intermediate acknowledgement as a transfer. Stock posts only at the final warehouse. Is that correct?
6. **Hosting location** (Q-I3) and **SMS provider** (Q-I2).
7. **Route timings:** can Kabonge or Tesfie review the planned hours and border dwell per lane in Master data → Routes?
8. **Scope cut** in §6 (⏭ items) and the **go-live date**.

---

## 10. Research sources (checked 7 Oct 2026)
- Framework size and performance: pkgpulse.com/guides/solidjs-vs-svelte-5-vs-react-reactivity-2026 · tech-insider.org/solidjs-vs-react-vs-svelte-2026
- Capacitor background geolocation: cdn.jsdelivr.net/npm/@capacitor-community/background-geolocation (README) · capawesome.io/blog/announcing-the-capacitor-background-geolocation-plugin · shop.transistorsoft.com
- Expo geofence limits: docs.expo.dev/versions/latest/sdk/location
- Why a PWA can't do background GPS: lists.w3.org/Archives/Public/public-device-apis-log/2023Jan/0017.html
- Northern Corridor Transport Observatory reports: top.ttcanc.org
- RECTS (customs e-seal tracking, government-only, no public API): wcoomd.org (Feb 2017 launch)
- Maps and routing: protomaps.com · openrouteservice.org/plans · graphhopper.com/pricing
- Offline sync: docs.powersync.com/client-sdk-references/capacitor
- Kenya DPA regulations 2021 and ODPC registration: odpc.go.ke
- Oracle Nairobi cloud region (iXAfrica): w.media
- SMS pricing: Africa's Talking (via celcomafrica.com and mctaba.com); sent.dm Kenya SMS pricing
- Typst PDF performance: recall.it

**Not verified:** APK sizes per framework, current PowerSync pricing, WhatsApp per-message rates in Kenya, whether the AWS Nairobi Local Zone is available, exact segment hours per corridor, and data-residency rules in Uganda, Tanzania, Rwanda, DRC and South Sudan.
