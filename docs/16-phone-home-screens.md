# 16 — Phone home screens (workstream D of plan 11)

Built 25 Oct 2026 for D-A1, D-A4 and the phone part of C-05 ([plan 11](11-roles-and-dashboards-plan.md) §C–D, client dashboards document §10). Progress: [CHECKLIST](CHECKLIST.md).

Rules followed (client's mobile rules): one chart or list per screen, short lists, status chips with an **icon and words** (never colour alone), tap targets of 44 px or more, a clear next action, and a visible "last synced" time on offline screens. No Plotly on the phone: light SVG and CSS bars only.

## 1. What each person sees

| Person | Where | Home | Taps through to |
|---|---|---|---|
| **Daniel, Michael** (directors) | Team app → Home | **Scorecard**: trucks on the road (vs a week ago), delayed trucks (+ missed check-ins), orders awaiting loading, stock value (+ days of cover), sales this month and profit this month (vs the same days last month, + margin), open alerts. **Top exceptions** (5, most urgent first): payments / POs to approve, delayed trucks, missed check-ins, fees unpaid 1 month+, trips without an agreed price, products running out, a loss this month. **Go to**: profit & margin, fleet, transport fees, stock, sales | Open alerts list, profit by company, fleet by route, unpaid fees by age, shipment / truck / trip screens |
| **Kabonge** (planner) | Team app → Home | **Order pipeline** chips by stage: draft, waiting approval (only when approvals are on), issued not sent, waiting to load, loading, on the road, delivered (30 days). **Follow up**: ordered vs loaded vs delivered for his open orders (one bar + numbers), open orders by age (< 3, 3–7, > 7 days), plan vs actual (ordered of planned, expected by today, on track / behind / over), alerts | Pipeline list per stage, biggest-gap list, ageing list, period plans, notifications; each order opens the PO |
| **Testfie** (truck follow-up) | Team app → Home | **Load at GBI Mombasa** (loader flow, no prices). **Live fleet** chips: on the road, delayed, at border, in transit, loading, in queue, arrived. **Follow up**: delayed trucks, open truck issues, drivers silent (amber 12 h, red 24 h), trips with no agreed price, fees unpaid 2 weeks+ / 1 month+ | Fleet grouped by route, issues (with repeat providers), driver updates with last-update badges, agreed-price list, unpaid fees by age; rows open the truck or the trip payments |
| **Asie, Yonas** (receivers) | Receiver screen (unchanged single task: the next truck to receive) | A strip of chips under Expense / Stock count / Re-export: **N to sign**, **N on the way**, **N low** (< 14 days), **N overstock** (> 60 days or no sales in 30 days), **expenses this month** (USD), and for Asie **open re-exports** | One short list in a sheet: trucks by expected arrival (→ receive & sign), products low / over (→ stock count), expenses by category (→ record an expense), re-export orders (→ re-exports). Quantities only, no stock values |
| **Joel, Eric, Moses, SBL loader** | Loader screen | **Today's list** button: to load (PO, truck no., cases) and **dispatched today** (truck, time, driver, cases) — no prices | Tap a row to see its products |
| **Drivers** | Driver screen | Unchanged: own trip, status update, sync state (now with the last synced time) | — |

Tabs (checked against the roster): directors Trucks / Orders / Money; Kabonge Orders / Plans / Truck desk; Testfie Queue / Truck desk / Money. Asie and Yonas open the receiver screen, loaders the loader screen, drivers the driver screen (unchanged routing in `apps/field/src/lib.ts`).

## 2. How it is built

- **No new API.** Everything is derived in `apps/field/src/team/glance.ts` from calls the API already scopes to the person: `analytics.summary`, `reports.dashboard / inventory / plannedVsActual / performance`, `loading.list`, `shipments.list`, `plans.list`, `pos.list`, `finance.fees`, `notifications.list`, the truck desk (`@btw/api/trucks`), `warehouse.stock / expenses`, `reexports.list`.
- **Screens:** `team/homes/DirectorHome.svelte`, `PlannerHome.svelte`, `TruckHome.svelte` (lazy, chosen in `team/screens/Home.svelte`; other office roles keep the generic home); drill-down lists `team/screens/Glance.svelte` at `#/glance/<key>` (`exceptions`, `profit`, `fees`, `agreed`, `pipeline`, `gaps`, `ageing`, `fleet`, `issues`, `drivers`); receiver strip `team/warehouse/WarehouseGlance.svelte`; loader list `components/TodaySheet.svelte`.
- **Shared phone components** (`team/components`): `StatusChip`, `CountTiles`, `ActionList`, `RowItem`, `GapBar`, `SyncLine`.
- **Order stage** (pipeline): latest PO revision; no truck loaded → *issued, not sent* or *waiting to load* (sent to the supplier); some loaded → *loading*; all loaded → *on the road* until every first shipment is acknowledged → *delivered*. Delivered cases = cases on acknowledged shipments.
- **Profit this month** = the combined performance report (company level) for the 1st of the month to today, compared with the same days of the previous month.
- **Stock low / overstock** for receivers = cases held ÷ cases sold per day in the last 30 days (same bands as the stock report).

## 3. "Last synced" (D-A4)

`apps/field/src/synced.ts` keeps the time this phone and the server last agreed — a screen's data loaded with signal (`live.ts`) or the outbox sent its queue (`@btw/api/outbox`, read only) — in localStorage, so it survives a restart without signal. The status pill on the driver, loader and receiver screens shows **Online / Offline / Sending… / Waiting to send N** and **Synced 4 min ago** underneath (dot + words). The menu sheet's "Waiting to send" block and the team homes and lists show the same line.

## 4. Bundle

Phone entry unchanged: **79.4 KB** gzipped (budget 90 KB). New lazy chunks (gzipped): DirectorHome 1.5 KB, PlannerHome 2.0 KB, TruckHome 1.7 KB, Glance 1.8 KB, glance data + shared components 8.0 KB, WarehouseGlance 3.7 KB, TodaySheet 1.9 KB. In the demo, the performance report runs in the mock's existing warehouse-money chunk.

## 5. Open points

- **API gaps (none blocking):** no history of "delayed trucks" or "stock value" to compare with a previous period (shown without a change); trucks on the road "a week ago" is reconstructed from shipment dates. A `GET /v1/dashboards/:key` endpoint (web work) could later replace the phone-side derivations.
- **To confirm:** the driver silence thresholds (12 h amber, 24 h red); whether Yonas should also see re-exports to Juba on his strip (today: Asie only).
