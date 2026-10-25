# 10 — Truck planner role → Truck follow-up officer (Testfie)

> **Update 25 Oct 2026 ([12](12-roles-access.md)):** the role id `truck_planner` is kept and relabelled **"Truck follow-up officer"**; it is **Testfie**'s role (roles document §4). Changes from what follows:
> - **Scope:** every truck, route and company; **loads only at GBI Mombasa** (`loadingPointIds: [s-gbi]`, `access.canRecordLoading`) while following every queue (`access.seesLoadingPoint` = all points).
> - **Transport master data is view-only.** Onboarding providers, trucks and drivers moved to **Kabonge** (planner, static data) and the directors (`TRANSPORT_EDITORS`).
> - **Features:** `logistics`, `loading`, `fleet`, `trucks`, **`truck-expenses`** (trip expenses, agreed price, transport side of trip costs — no goods value or landed cost), `purchase-orders` (view, GBI only), `master-data` (view), `transport-fees` (hook). **No** `finance` (trip financials are the directors'), no reports except the logistics report.
> - **Agreed transport price after loading:** loaders no longer enter it; Testfie (or a director) records it on the Truck desk / trip (`POST /shipments/:id/agreed-price`). Trips without one show "not recorded" and are counted.
> - **Queue order:** Testfie on every point and Kabonge on his pairs' points (Q11 — to confirm). Directors view queues.
> - **Demo logins:** `testfie` (+254700000006). The `btw-trucks` and `trucks` demo users are retired.
>
> The sections below describe the original 18 Oct build; where they disagree, doc 12 wins.

The client's request: *"a role that will purely work on truck planning: they onboard the organizations / saccos / providers of trucks and arrange the order of the trucks on the loader queue; this person also checks on the status of trucks in queue, in transit, on delivery, current locations, any issues and so on; also arranging the trucks and understanding any expenses."*

## 1. The role
- **Role id:** `truck_planner`. **Label:** "Truck planner". **Hint:** "Onboards transport providers and trucks, runs the loading queues, follows trucks and their costs".
- **Scope:**
  - **Companies:** `entityIds`, as for other staff. A truck planner of one company sees only that company's queues, trips and costs.
  - **Loading points:** the `loadingPointIds` on the user's profile. If the profile lists none, the truck planner works every loading point of their companies. The rule is `rules.seesLoadingPoint`, used by both the API and the mock.
  - **Not scoped:** providers, trucks and drivers are shared master data across the three companies, as before.
- **Relation to `fleet` (Fleet follow-up):** `fleet` keeps working unchanged.
  - The truck planner has everything fleet has for trucks: logistics, trip finance, check-ins and issues (`OPS`), acknowledgement, recording a loading, and transport master data.
  - It adds provider onboarding, queue management with reasons, and the Truck desk.
  - It does **not** get fleet's procurement and analytics features: POs, period plans, the dashboard, reports.
  - Notifications sent to `fleet` also reach `truck_planner` (`rules.withTruckPlanner`, applied in the mock and in `NotifyService`).
  - Fleet (and planners, operations, directors) also get the new Truck desk.

## 2. Features (role × feature matrix, `packages/api/src/rules.ts`)
| Feature | Truck planner | Notes |
|---|---|---|
| `logistics` | ✓ | Waiting lists and loadings at their loading points; shipments, tracking map and issues of their companies |
| `trucks` (new) | ✓ | Truck desk. Also given to director, planner, fleet and operations |
| `master-data.transport` (new) | ✓ | Providers, trucks and drivers: add, edit, deactivate. Also admin, director, planner and fleet. Full `master-data` (products, prices, users) is **not** included |
| `finance` | ✓ read + add expense | Trip costs, payments and transport owed. May add a trip expense. **Cannot** record payments (accounts and directors) or approve them (`finance.approve`, directors only) |
| Reports | logistics only | `REPORT_FEATURES.logistics = ['reports', 'trucks']`. The finance report (sales margins) now needs `reports` |
| POs, period plans, sales, inventory, users, dashboard | ✗ | `GET /plans` and `GET /pos` return `[]`; `POST /plans` → 403. No sales or stock lists |

All of this is enforced in both places, identically:
- **Server:** the role lists in `principal.ts` and `platform`/`logistics`/`finance` services, `hasFeature`, and `canSeeLoadingPoint`.
- **Mock:** `mock-client.ts` uses the same rule helpers.

## 3. Onboarding providers, trucks, drivers
- **Provider fields:** name (unique), kind (`company` | `sacco` | `individual` | `market`), contact person, phone (E.164, so `07…` becomes `+2547…`), email, regular / non-regular, notes, active.
- **Truck fields:**
  - provider, registration, trailer, capacity in cases (1–10,000), default driver, optional papers (`documents`), active.
  - The registration is unique, case- and space-insensitive.
  - A truck cannot be deactivated while it is in a queue.
- **Driver fields:**
  - provider, name, phone (unique among drivers), licence, has app, active.
  - With `hasApp` and `appLogin: true`, a new driver gets a field-app login: a `driver` user linked to the driver record, with a random 4-digit PIN that is returned once. The mock always gives PIN 1234.
  - A phone that belongs to an office user is refused (409).
- **Validation:** `rules.validateProvider`, `validateTruck` and `validateDriver` run in the web forms, the mock and the API. Errors return 422; duplicates return 409.
- **API endpoints:**
  - `POST` and `PATCH /masterdata/providers[/:id]`
  - `POST` and `PATCH /masterdata/trucks[/:id]`
  - `POST` and `PATCH /masterdata/drivers[/:id]`
  - Deactivating is `PATCH { active: false }`. History is kept, and deactivated trucks and providers can no longer be queued.
- **Migration** `apps/api/drizzle/0008_truck_planner.sql` (drizzle-kit):
  - `providers` gains `kind`, `contact_name`, `email`, `notes` and `active`. Existing non-regular providers get `kind = 'market'`.
  - `trucks` gains `active` and `documents`.
  - `drivers` gains `active`.

## 4. Loading queues
- **Add** a truck to any queue in scope; it goes to the end. **Reorder** in one of three ways:
  - one place up or down: `POST /waiting/:id/move { dir }`
  - to a position: `{ position }`
  - by dragging a row (web)
- **Remove** a truck with a reason: `DELETE /waiting/:id { reason }`, 200 characters at most, from a fixed list or free text. The reason is kept in `audit_log`.
- **Loader notifications:** every reorder and removal notifies the `loader` role of that company: "Loading queue changed — KBL: KDA 101S moved from #3 to #1 by …" or "Truck removed from the queue — … — Breakdown".
- **Wait time** is shown per truck. A wait of more than 24 h is flagged as a long wait.
- **PO refs on loadings:** loadings now carry `poRef`, so the truck planner sees PO numbers without access to POs.

## 5. Truck desk (web `#/trucks`, the truck planner's home)
- **Trucks tab:**
  - **States:** Waiting at loading point, Loading, In transit, At border, Delayed (6 h or more late, or an open issue), Arrived at warehouse, Idle.
  - **Columns:** where the truck is now (GPS ping, else the last check-in, else the loading point), ETA, driver, provider, open issues, days since it last moved.
  - **Filters:** state chips, provider, loading point, route and search. In the Group view, a company column is added.
  - **KPIs:** trucks in queue, on the road, delayed, open issues, average queue wait, transport owed.
  - **Charts:** trucks by state and queue by loading point, drawn with the Plotly chart kit, which loads lazily.
  - **Detail:** click a truck to see its trips, its expenses and its open issues.
- **Expenses tab:**
  - **Per provider and per truck:** agreed transport, extra costs, payments made, payments waiting for approval, balance owed, and trip cost per case.
  - Uses the same pure functions as the team app: `packages/api/src/trucks.ts`.
- **Trip expense:** "Trip expense" adds a cost to a trip (`finance.addCost`). Accounts then record the payment, and payments above the limit wait for a director, as before.
- **Export:** CSV of the filtered trucks, or of the cost tables.

## 6. Team app (PWA, `apps/field/src/team`)
- **Tabs:** Home · Queue · Trucks (truck desk) · Money · More. Shipments and the map are in the home menu and in More.
- **Home:**
  - KPIs: trucks in queue, on the road, delayed, open issues, average wait, transport owed.
  - **Needs attention:** delayed trucks, open issues, long queue waits, and trucks on the road with no movement for 2 days.
  - **Add provider or truck:** a deep link to the web.
- **Queue:** chips per loading point, big up and down buttons, "Load next", remove with a reason, and add a known truck.
- **Trucks:** state chips, search, map view, and a "Providers & costs" segment.
- **Truck detail:** where the truck is, call the driver or provider, issues, costs, trips, and add a trip expense.
- **Lazy chunks:** Queue, Fleet and FleetDetail are lazy chunks, so the field entry stays within its 80 KB budget.

## 7. Demo logins
- **Web:** password `demo1234`. **Field / PWA:** phone and PIN `1234`.

| Username | Phone | Scope |
|---|---|---|
| `testfie` — Testfie (truck follow-up officer, since 25 Oct) | +254700000006 | BTW · Nihna · Kivu, every queue; loads at GBI Mombasa |
| ~~`btw-trucks`, `trucks`~~ | — | retired 25 Oct (doc 12) |

- **Seed data:**
  - ETS Sabrina Ltd now has kind and contact data. The contact details are placeholders and are marked "to confirm".
  - A sample sacco, **Umoja Truckers Sacco (demo)**, has two trucks (KDA 101S, KDB 202S) and two drivers, so onboarding is visible.

## 8. Tests
- **Mock:** `packages/api/test/trucks.test.ts`, part of `pnpm test`. It covers the permission matrix, validators, onboarding, queue reorder and remove with loader notifications, the truck desk states and KPIs, and cost totals.
- **Server QA:**
  - `apps/api/test/qa/trucks.ts` (`--only trucks`, database `btw_qa_trucks`, port 3288).
  - The security matrix also covers `btw-trucks`: trip financials, adding an expense, approving payments, adding providers and editing drivers, queues at KBL and UBL, check-ins, acknowledgements, and the finance and logistics reports.
