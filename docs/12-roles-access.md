# 12 — Users, roles and access (workstream A of plan 11)

Built 25 Oct 2026 from the client's roles document (`docs/inspiration/Users_Roles_Access_Control_updated.docx`, §3 routes, §4 users, §5 directors, §7 access matrix). Plan: [11](11-roles-and-dashboards-plan.md). Progress: [CHECKLIST](CHECKLIST.md) A-01…A-08.

Every decision marked **to confirm** is our proposal while the client's answers are pending.

## 1. Roster and demo logins (A-01)

Web password `demo1234`; phone PIN `1234` (field app and team PWA). Usernames are the user id without `u-`.

| Person | Username | Phone | Role id(s) | Scope |
|---|---|---|---|---|
| Daniel — Director | `daniel` | +254700000001 | `director` | Every company (Group view) |
| Michael — Director | `michael` | +254700000020 | `director` | Same as Daniel (Q10: same access — to confirm) |
| Kabonge — Purchase planner + static data | `kabonge` | +254700000002 | `planner` | Pairs BTW–KBL, Nihna–UBL, Kivu–SBL (**not** Nihna–GBI) |
| Testfie — Truck follow-up officer | `testfie` | +254700000006 | `truck_planner` (relabelled) | Every truck / route / company; loads at GBI Mombasa (`loadingPointIds: [s-gbi]`) |
| Joel, Eric — Loaders | `joel`, `eric` | +254700000003, +254700000004 | `loader` | BTW, KBL Nairobi |
| Moses — Loader | `moses` | +256700000005 | `loader` | Nihna, UBL Kampala |
| SBL loader (to confirm) | `sbl-loader` | +255700000021 | `loader` | Kivu, SBL Tanzania — placeholder until Q2 is answered |
| Asie — Receiver, warehouse, re-export | `asie` | +250700000007 | `receiver`, `reexport` | Warehouses Gisenyi (`w-kgl`) and Goma |
| Yonas — Receiver, warehouse | `yonas` | +211900000008 | `receiver` | Warehouse Juba |
| Drivers | — | +254702750019 Mawazi K · +254701811686 Kanyike E · +256711000002 Joseph Mugisha | `driver` | Their own trips |

- **Retired** (ids no longer seeded): `u-dir`, `u-btw-plan`, `u-nud-plan`, `u-kvd-plan`, `u-acc`, `u-btw-acc`, `u-nud-acc`, `u-kvd-acc`, `u-admin`, `u-btw-trucks`, `u-trucks`, `u-tesfie`, `u-zonas`. History that pointed at them now names the right person: orders raised by Kabonge (Nihna–GBI by Daniel, who raises them is Q2), approvals by Daniel / Michael, period plans by Kabonge, payments approved by Daniel, Juba sales by Yonas.
- **Renamed:** Zonas → **Yonas** (user, warehouse "Yonas Juba", checkpoint "Yonas warehouse Juba", receiving company **"Yonas Company"**, id `rc-yonas`); Asie's receiving company is **"Asie Company"**; Tesfie → **Testfie** (spelling as the client wrote it — Q10).
- **Company display names:** BTW, Nihna (Nihna Unique Distributors Ltd), Kivu (`shortName`).
- **Roles kept in code, unassigned:** `accounts`, `sales`, `operations`, `fleet`, `admin`. User management is the directors'.
- **New role id** `reexport` (label "Re-export planner") for Asie; the re-export order itself is workstream B.

## 2. Access matrix as implemented (A-02, A-03)

Shared rules: `packages/api/src/rules.ts` (`FEATURES`, the role × feature keys) and **`packages/api/src/access.ts`** (the "Own" scopes and write rules). The NestJS services and the in-browser mock call the same functions; the web and PWA hide navigation, tabs and buttons with the same keys (`/me.features`).

F = view + change · O = own scope only · V = read only · — = no access.

| Feature (§7) | Daniel, Michael | Kabonge | Testfie | Joel, Eric | Moses | Asie | Yonas | Drivers |
|---|---|---|---|---|---|---|---|---|
| Users and roles | F | — | — | — | — | — | — | — |
| Companies, suppliers, goods, receivers | F | F (to confirm) | — | — | — | — | — | — |
| Transport providers, trucks, trailers, drivers | F | F | V | V | V | V | — | — |
| Purchase plans | F | O (his pairs' lines) | — | — | — | — ¹ | — | — |
| Purchase orders | F | O (raise / edit his pairs) | V (GBI) | V (KBL, no prices) | V (UBL, no prices) | V ¹ (to her, no prices) | V (to her, no prices) | — |
| Loading | V | V (his pairs) | O (GBI) | O (KBL) | O (UBL) | — ¹ | — | — |
| Dispatch and multi-leg shipments | V | V (his pairs) | F | O (dispatch their loads) | O | O (send on from her warehouses) | V (to Juba) | O (their trips) |
| Fleet follow-up and truck issues | V | V | F | — | — | V | V | O |
| Truck expenses | F | — | F | — | — | — | — | — |
| Delivery acknowledgement | V | V | — | — | — | O | O | — |
| Warehouse inventory | F | — | — | — | — | O (no values) | O (no values) | — |
| Warehouse expenses | F | — | — | — | — | O ² | O ² | — |
| Sales, selling prices, trip financials | F | — | — ³ | — | — | — | — | — |
| Report of each feature | F | O (plans, PO / loading / logistics of his pairs) | O (logistics: trucks) | — | — | O ⁴ | O ⁴ | — |
| Combined performance + margins | F ² | — | — | — | — | — | — | — |
| Notifications and alerts | All | Own | Own | Own | Own | Own | Own | Own |
| Audit log | V | — | — | — | — | — | — | — |

¹ Asie's "Own" purchase plans, purchase orders and loading are her **re-export orders** (Rwanda → Juba), built in workstream B. Today she sees the orders delivering to her (View) and moves goods on with *Send on* from her own warehouses (Dispatch: Own).
² Hooks only (`warehouse-expenses`, `warehouse-stock`, `performance`, `selling-prices`, `re-export`, `transport-fees` feature keys) — built in workstream B.
³ Testfie reads the **transport side** of trip financials for her truck expenses (agreed price, expenses, payments against references) without goods value or landed cost; she cannot record or approve payments.
⁴ Receivers' own report today is their incoming-deliveries working set; their dashboards come with workstream C. The inventory report shows stock values and is not open to receivers.

**Rules worth knowing**
- **Directors view loading, dispatch, fleet and acknowledgement** (§7 says View): they cannot record a loading, check a truck in, report an issue or acknowledge. They can still raise orders (incl. Nihna–GBI, Q2), edit static data, record truck expenses and the agreed price, record and approve payments, sell, and manage users. Easy to widen if the client wants "full access" to mean operational too (Q10).
- **Loading queue order:** Testfie on every loading point, and Kabonge on the loading points of his pairs (Q11: both — to confirm). Loaders add trucks at their own point. Directors view.
- **Testfie loads only at GBI Mombasa** (`canRecordLoading` = loader or truck follow-up officer **and** the point is on the profile), but follows every queue and truck.
- **Pairs** (`users.pairs`, jsonb): plans, POs, loadings, queues, shipments and reports of a pair-scoped planner are limited to them. Period plans are per company: Kabonge sees and edits only his pairs' lines; lines of other pairs are kept untouched when he saves.
- **Routes** (`users.route_ids`, optional): an empty list = every route; a list narrows the shipments the user sees.
- **Receivers** see shipments delivered to (or sent on from) their warehouses only; Asie never sees Yonas's deliveries except her own onward moves.
- **Notifications** stay role + company based ("Own" = their role's alerts in their companies); per-pair filtering is not done (deviation, small).
- **Static data read** (product, company and route names) stays in the reference bundle for every signed-in app — the apps need the names; the matrix "—" is enforced on editing.
- Audit-log and delivery-acknowledgement records are hidden from roles with "—" (403 / empty list).

## 3. Prices and payments hidden by role (A-04)

- **Loaders, receivers (and `reexport`), drivers** (`access.seesPrices` false) get orders and POs with `pricesHidden: true` and no `price` on any line, loadings without `agreedTransport` / `transportCurrency`, stock rows without `landedCostPerCase`, an analytics summary without money, the reference bundle **without the price list** (own ETag), no PO letter / PDF (it shows prices), no price-bearing version snapshots. Receivers see only their own lines of an order.
- **Agreed transport price after loading:** the loader's hand-over (field `LoadingPoint` / `HandoverSheet`, web *Record loading*) has no price; the API no longer requires it and **ignores** a price sent by a loader (old offline outboxes keep working). The loading creates the shipment with "agreed price: not recorded yet" (`loadings.agreed_transport` NULL, no Transport cost line).
  - Testfie or a director records it afterwards: **`POST /v1/shipments/:id/agreed-price { amount, currency?, docRef? }`** (`finance.setAgreedPrice`) on the Truck desk, trip detail (web and PWA). It creates the trip's Transport cost (USD value at the approved month rate) or corrects it while nothing is paid against it (409 after a payment). Audited with before / after.
  - Testfie loading at GBI may enter the agreed price in the same form (she has truck expenses).
- **Missing agreed price is counted, never zero:** `finance.trips()` rows carry `agreedRecorded`; the Truck desk KPI "Agreed price not recorded" (`deskKpis.agreedMissing`) and cost lines' `notRecorded`; per-case transport only over recorded trips; the finance report's `totals.agreedMissing` and `byProvider[].agreedMissing`; the capture check flags "Agreed transport price not recorded" with a link to the Truck desk.

## 4. Static data (A-05)

Kabonge and the directors (`master-data.static`) add, edit and deactivate:
- **Companies** — code (2–6 capitals, unique), legal and short name, PO prefix (default `<CODE>-PO`, unique), address, phones, email, website, tagline, reporting currency. **Room for 5** (BTW, Nihna, Kivu + 2) — `MASTER_LIMITS`, to confirm. A new company is open to the directors at once.
- **Suppliers** — code, name, city, country, email; a new supplier needs its loading-point location (a `loading` checkpoint is created). **Room for 7** (KBL, UBL, GBI, SBL + 3), to confirm. No new orders from a deactivated supplier or company (409).
- **Goods** — SKU (unique), brand, pack, units per case, size (ml), supplier, category (spirits / beer / wine / rtd) and an optional purchase price (USD, replaces the price-list row).
- **Receiving companies** — name (unique), countries.
- Transport (providers, trucks, drivers) moved from the truck planner to **Kabonge and the directors**; Testfie, loaders and Asie view.
- Validators: `packages/api/src/static-data.ts` (its own module so the web entry stays small), used by the web forms, the mock and the API (422 invalid, 409 duplicate). Endpoints: `POST/PATCH /v1/masterdata/{entities|suppliers|products|receiving-companies}[/:id]`. Deactivate = `PATCH { active: false }`.
- **Change history** = the audit log (each edit stores the changed fields before / after); the Master data screen links a record to its history for directors.

## 5. Routes (A-06)

Named as in §3; ids unchanged. Goma is reached through the Gisenyi/Rubavu – Goma border (`cp-gisenyi`).

| Id | Name | Stops |
|---|---|---|
| `r-nbo-kgl` | Nairobi → Rwanda (Gisenyi) | KBL · Gilgil · Eldoret · Webuye · Malaba · Kampala · Mbarara · Katuna · Kigali · Gisenyi |
| `r-nbo-goma` | Nairobi → Congo (Goma) | … Gisenyi · Gisenyi/Goma border · Goma |
| `r-nbo-juba` | Nairobi → Juba | … Gulu · Elegu/Nimule · Juba |
| `r-kla-kgl` | Uganda → Rwanda (Gisenyi) | UBL · Mbarara · Katuna · Kigali · Gisenyi |
| **`r-kla-goma`** (new) | **Uganda → Congo (Goma)** | UBL · Mbarara · Katuna · Kigali · Gisenyi · border · Goma |
| `r-msa-kgl` | Mombasa → Rwanda (Gisenyi) | GBI · Mariakani · Voi · Athi River · Gilgil · Eldoret · Malaba · Kampala · Katuna · Kigali · Gisenyi |
| **`r-msa-goma`** (new) | **Mombasa → Congo (Goma)** | … Kigali · Gisenyi · border · Goma |
| `r-msa-juba` | Mombasa → Juba | GBI · … · Malaba · Gulu · Nimule · Juba |
| `r-mwz-kgl` | Tanzania → Rwanda (Gisenyi) | SBL Mwanza · Nyakanazi · Rusumo · Kayonza · Kigali · Gisenyi |
| **`r-mwz-goma`** (new) | **Tanzania → Congo (Goma)** | … Kigali · Gisenyi · border · Goma |
| `r-kgl-juba` | Rwanda → Juba (Asie re-export) | Gisenyi · Kigali · Katuna · Mbarara · Kampala · Gulu · Nimule · Juba |
| `r-kgl-goma` | Rwanda → Congo (Gisenyi → Goma transfer) | Gisenyi · border · Goma |

Planned hours are seed values (replace with historical medians). Routes can be **assigned to users** (optional route scope, Users screen). The seeded 15-month history keeps its lanes; the new routes are available for new orders.

## 6. Audit log (A-07)

- Every change request is logged as before (user, time, channel, method, path, outcome) and now also: **feature** (first path segment), **record type / id**, a **summary**, and **before / after** values when the service knows them (static data, transport, users, period plans, agreed price, queue removal, check-in undo). Request bodies are stored without secrets (PIN / password / tokens dropped, long strings such as images shortened).
- Mechanism: an `onRequest` hook opens a per-request note (`AsyncLocalStorage`, `apps/api/src/common/audit-context.ts`); services call `auditNote({...})`; the audit interceptor writes one row.
- **`GET /v1/audit?userId&feature&from&to&q&page&pageSize`** (directors) → `{ rows, total, page, pageSize, byDay }`, newest first, company-scoped; `q` matches path, summary, record id and the user's name. Mock: `api.audit.list()` over a seeded month of activity + every mock change.
- Web: **Admin → Audit log** (`#/audit`): filters user / feature / dates / text, paged table, expandable before → after, activity-by-day sparkline.
- Migration backfills `feature` on existing rows.

## 7. Users screen (A-08)

Directors assign roles (incl. `reexport`), companies, **buyer–supplier pairs** (company × supplier grid), loading points, warehouses and **routes**; see **last sign-in** (`users.last_login_at`, set at every sign-in); deactivate (a director cannot deactivate himself or drop his own director role). Scope lists are validated (unknown ids → 422). Any scope or role change ends the user's sessions.

## 8. Apps

- **Web:** navigation by feature key (Loading → `loading`, Tracking → `fleet`, Master data → any of `master-data`, `.static`, `.transport`, Audit log → `audit`). Home: directors the dashboard; Kabonge `#/plans`; Testfie `#/trucks`; loaders `#/loading`; receivers `#/shipments`. One-tap demo list = the roster.
- **Field / PWA:** Joel, Eric, Moses and the SBL loader open the loader screen (no price field); Asie and Yonas the receiver screen (Asie also "Load & hand over" for onward moves); drivers unchanged. Directors, Kabonge and Testfie get the team shell: directors Trucks / Orders / Money, Kabonge Orders / Plans / Truck desk, Testfie Queue / Truck desk / Money plus a **"Load at GBI Mombasa"** home entry that opens the loader flow inside the team shell.
- Budgets: the mock's admin-only operations (static data, users, audit, agreed price, transport and warehouse writes) live in a lazy chunk (`packages/api/src/mock/admin.ts`); web entry ≈ 115 KB of 120.

## 9. Data and migration

`apps/api/drizzle/0009_roles_access.sql` (drizzle-kit generate):
- `users.pairs` (jsonb, default `[]`), `users.route_ids` (text[]), `users.last_login_at`
- `active` on `entities`, `suppliers`, `products`, `receiving_companies`
- `loadings.agreed_transport` nullable (pending loadings and zero prices → NULL)
- `audit_log.feature`, `record_type`, `record_id`, `summary`, `before`, `after` + indexes on time, user and feature; `feature` backfilled from the path

The demo seed (mock and server, same snapshot) uses the new roster, ids and routes; one live Kivu truck (T 733 DKL) is loaded **without** an agreed price so the "not recorded" flow is visible.

## 10. Tests

- Mock (`pnpm test`): `packages/api/test/access.test.ts` (new: roster, routes, §7 features per person, prices hidden, agreed price after loading, static data, audit search, user scopes) + the existing suites moved to the new roster.
- Server QA (`pnpm --filter @btw/server test:qa`): **`security`** has a new section *access matrix §7* — one check per person × feature (11 people × 17 features) with view / own-scope / change / someone-else's probes; **`access`** (new) — static-data CRUD and limits, audit search with before / after, prices hidden, missing agreed price in reports; **`trucks`** rewritten for Testfie (GBI-only loading, agreed price, view-only transport, Kabonge onboarding, queue order by both); the other suites moved to the roster.
- API e2e (`pnpm --filter @btw/server test`) moved to the roster (SBL loader loads, Testfie records the agreed price).

## 11. To confirm (client)

| # | Decision we took | Question |
|---|---|---|
| Q2 | Nihna–GBI orders raised by a director; SBL loading by a placeholder "SBL loader" | Who raises Nihna–GBI POs; who loads at SBL Tanzania? |
| Q3 | Rwanda → Juba re-export trucks followed by Testfie (she follows every truck) | Who follows them up? |
| Q4 | Payments recorded and approved by the directors; sales and trip financials directors-only | Who approves truck payments, handles sales and trip financials? |
| Q10 | Spellings Testfie and Yonas; Daniel and Michael identical | Correct? Same access? |
| Q11 | Queue order by both Testfie (all points) and Kabonge (his pairs' points) | Testfie, Kabonge or both? |
| §10 | Kabonge maintains companies, suppliers, goods and receiving companies ("proposed") | Confirm |
| §2 | Room for 5 companies and 7 suppliers enforced as a limit | Keep as a limit? |
| — | Directors read-only on loading / dispatch / fleet / acknowledgement (§7 "View") | Should "full access" include operating trucks? |
| — | Placeholder phone numbers for Michael (+254700000020) and the SBL loader (+255700000021) | Real numbers |
