# BTW platform — work checklist

Living tracker. **Plan and reasons:** [`11-roles-and-dashboards-plan.md`](11-roles-and-dashboards-plan.md). Update the status and the *Updates* log as work moves.

**Status:** ✅ done · 🔄 in progress · 🟡 partly there (exists, needs change) · ⬜ to do · ❓ waiting for an answer · ⏸ waiting for files

## Updates
| Date | Update |
|---|---|
| 27 Oct 2026 | **Page design review Phases 1–3 built** ([doc 17 §7](17-page-design-review.md)). Work pages open on their list with a summary strip from the metric registry (filters in the address, needs-action defaults), one primary action that asks for the company in the Group view, "See the analysis →" to the matching Home tab; the 8 Overview tabs are gone. Merged: **Stock** (Inventory + Warehouse stock), **Transport costs** (Trip financials + Transport fees: Fees · Trips · Expenses), **Truck desk** tabs Board · Queues (was Loading) · Providers & trucks · Costs, Shipments **Map view** (was Tracking). **Reports and Sales velocity retired** into Home sections (Purchasing, Loading, Fleet, Fees & expenses, Warehouse, Sales); *Plan or check a period* → `#/period-plans/check`; Performance in sections. Sidebar 23 → 16; Integrations under Master data. Redirects for every old route and filter; all shared links moved; new `redirects.test.ts`, strip checks in `metrics.test.ts`; phone sections renamed and new links mapped. |
| 26 Oct 2026 (late night) | **Phase 0 of the page design review: trust the numbers** ([doc 18](18-metrics.md)). **F-0a:** the USD 3,050,000 agreed price was a seed bug: the currency (UGX) was set on the loading *after* the cost line was written, so it was stored as USD. Fixed in the seed, plus repair migration `0012_transport_cost_currency`. New amount sanity rules (`packages/api/src/amounts.ts`, used by the server, the mock and the screens): usual ranges per entry in USD; outside the range the screen asks "are you sure?" and the server only saves with `confirmUnusual` (audited); impossible amounts are refused (422); a warning when an amount looks like a local currency entered as USD; currency always explicit. **F-0b:** one metric registry (`packages/api/src/metrics.ts`) for trucks on the road, delayed, at a border, no check-in, arriving today, delivered, on time, orders / trucks to load, stock value, cases on hand, in transit, needs attention, sales, cases sold, owed / overdue, transport owed, fees over 14 / 30 days, price not recorded, landed cost per case, profit and margin. Home, the page tiles, the phone homes, the summary and the reports all use it: trucks on the road are now 6 everywhere (was 8 on Shipments) and delivered 132 everywhere (was 130 of 134 on POs). **F-0c:** 46 spec codes and doc references removed from screen text, stale PO-draft labels fixed, `pnpm check:text` runs in `pnpm verify`. Tests: `metrics.test.ts` 85 checks over 5 scopes, `amounts.test.ts` 32 checks, QA 1,179/1,179 (`money` +17), API e2e 121, e2e 103/103; web entry 109.1 / 130 KB, phone 85.2 / 90 KB. |
| 26 Oct 2026 | Page design review written (docs/17): work pages should open on their lists, analysis stays on Home; found a USD 3,050,000 agreed-price data bug, numbers that disagree between pages, spec codes in UI text. **Waiting for your decisions** before building. |
| 26 Oct 2026 (night) | **Purchase orders: create / update / delete, no drafts** ([doc 09 §4](09-plans-po-revisions.md)). Sidebar: one *Purchase orders* entry (`#/pos`), old `#/plans` links redirect; create issues at once ("Approved automatically") or *Awaiting approval* when `[approvals] purchase_orders = true`; *Update* = next revision `<ref>-rev00N` with a required reason, one counter with loading revisions, loaded lines locked at what was loaded, fully loaded → refused; immutable `po_versions` snapshots + per-line change records, Versions panel (side by side, PDF per version), *Email revised PO to supplier*; soft *Delete* with a reason only before loading. Pipeline stages Created → Sent → Loading → On the road → Delivered (+ Awaiting approval). Team PWA: no Drafts / PO approvals (switch off), PO detail with versions. Migration `0011_po_versions` (submitted → awaiting approval, auto-approved when off; draft / returned / rejected → discarded). Tests: unit `pos.test.ts` 50 checks, QA 1,162/1,162, API e2e 121. |
| 26 Oct 2026 (evening) | **Directors' Today view** ([doc 15 §3.1](15-dashboards.md)): the directors' *My dashboards* tab is now one curated daily view instead of 12 separate panels — KPI strip (sales MTD vs same days last month, profit + margin at landed cost v2, cash to collect with overdue part, trucks on the road with delayed / arriving today / on-time %; each with a sparkline), daily sales & profit chart (30 / 90 days / this year, legend toggles, export), *Needs your decision today* (payments to approve, delayed or silent trucks, fees past red days, stock under 14 days, arrivals not signed > 24 h, top sellers below target margin — counts, owners, links), stock health ring, sales by company (logos) / warehouse, top products. New key `director-today` (directors only, 403 for others), pure-SVG charts (`SmoothTrend`, `SparkArea`, `RingDonut`), lazy chunk; web entry 100.1 / 130 KB. Tests: `dashboards.test.ts` + QA `dashboards` 137/137. |
| 26 Oct 2026 | Home, Dashboards and Command view merged into **one Home with tabs**: My dashboards · Business · Purchasing · Loading · Fleet · Fees & expenses · Deliveries · Warehouse · Sales · Alerts & admin · (directors, Group view) Companies. Old links `#/dashboards/<group>` and `#/overview` open the matching tab. |
| 25 Oct 2026 | Demo refreshed with today's version and the named users (E-03): https://ac43-41-90-208-68.ngrok-free.app (changes when ngrok restarts). Known UX issue: on Asie's phone a truck waiting to be signed hides "Load & hand over" until it is signed. |
| 25 Oct 2026 (late night) | **Workstream E docs and tests.** E-01: deck rebuilt as 36 slides (`docs/presentation/build_pptx.py`) with the real roster in the journey, swimlane and actors slides, an access-matrix summary, warehouse money, landed cost v2 (worked example), two dashboard slides with screenshots, web and phone home screens, Testfie's role, done-today stats (QA 1,108, web 100.3 / 130 KB, phone 79.4 / 90 KB), new demo logins, next phase, and 8 grouped question slides (answered ones such as PO and plan approval removed). Every slide was rendered and checked. Architecture pack v1.2 (`docs/architecture/`, 10-page PDF + HTML + Word): roster in the process, access scopes, warehouse money, re-exports, `GET /v1/dashboards`, migrations 0009 / 0010, landed cost v2 data flow. P-03: `pnpm e2e` green, 99/99 steps (own DB `btw_e2e`, :3197; port-in-use guard). It covers Kabonge issuing the PO with no approval, the no-price hand-over, the damage reason, Testfie recording the agreed price, transfer and send-on by Testfie, and a new re-export journey Asie → Yonas. Mockup scripts moved to the new user ids (not re-run). Flaky QA: not reproduced in 4 runs, all 1,108 / 1,108, including one straight after `pnpm verify`. Fixed the likely cause: the push / driver notification checks raced a fire-and-forget push after a fixed 300 ms sleep and now poll for up to 5 s (`qa/integrations.ts`, `api.e2e.ts`). Also: the load test deadline is immune to clock jumps, and harness boot fails fast with the server log. |
| 25 Oct 2026 (night) | **P1 dashboards on the web + web home screens** ([doc 15](15-dashboards.md)): all 28 P1 dashboards and the three pulled-forward visuals (fast/slow scatter, route × stop heatmap, delivery-loss Pareto) at `#/dashboards/<group>`, each with definition, unit, period, freshness, drill-down, CSV / Excel / PDF and "No data yet"; `#/` = each person's own set (C-05 web). One endpoint `GET /v1/dashboards` (shared builders `packages/api/src/dashboards.ts`, scoped per person, same in the mock); director currency selector. Web entry 116.9 → ≈ 100 KB (the old dashboard moved to `#/overview`, lazy). Tests: `dashboards.test.ts`, QA suite `dashboards` (118 checks). |
| 25 Oct 2026 (night) | **Phone home screens** ([doc 16](16-phone-home-screens.md)): per-person homes in the team app for the directors, Kabonge and Testfie with one-list drill-downs (`#/glance/…`); Asie / Yonas warehouse strip on the receiver screen (to sign, on the way, stock low / overstock, expenses this month, Asie's re-exports); loaders' "Today's list" (to load + dispatched today, no prices); "last synced" / "waiting to send" on every offline screen (D-A1, D-A4, phone part of C-05). No new API; phone entry unchanged at 79.4 KB, new screens are lazy chunks. |
| 25 Oct 2026 | Size budgets raised by 10 KB each (your decision): web entry 130 KB, phone entry 90 KB (`scripts/check-size.mjs`, docs/03). |
| 25 Oct 2026 (evening) | **Workstream B built** ([doc 14](14-warehouse-money.md)): warehouse expenses (B-01), warehouse stock counts / adjustments without values (B-02), re-export orders Asie → Yonas as new shipments `ASIE-RX-…` (B-03), transport-fee tracking with amber 14 / red 30 days (`config.toml [fees]`) (B-04), selling prices + target-margin helper, new sales default to them (B-05), landed cost v2 with `[costs] allocation` (B-06), the directors' combined performance report at product / warehouse / company / receiving company / business level (B-07), shortage / damage reasons on acknowledgements (B-08). Migration `0010_warehouse_money`; 3 months of seeded history. Tests: `pnpm verify` green (web 116.9 KB, field 79.4 KB), new `money` QA suite (QA 990/990), `money.test.ts`. Decisions to confirm in doc 14 §8. B-09 still waiting (Q7). |
| 25 Oct 2026 (later) | **Workstream A built** ([doc 12](12-roles-access.md)): the client's roster (Daniel, Michael, Kabonge, Testfie, Joel, Eric, Moses, Asie, Yonas, drivers; made-up users retired), the §7 access matrix in the API, the mock and the UI with "Own" scopes (buyer–supplier pairs, loading points, warehouses, optional routes), no prices for loaders / receivers / drivers, the agreed transport price recorded **after** loading by Testfie, static-data editing (companies, suppliers, goods, receiving companies), routes to Congo from Uganda / Mombasa / Tanzania, the directors' audit log screen, Users screen with pairs / routes / last sign-in. Migration `0009_roles_access`. Decisions marked "to confirm" in doc 12 §11. Tests: `pnpm verify` green (web 115.6 KB, field 78.5 KB), new QA `access` suite + person × feature matrix in `security`. |
| 25 Oct 2026 | Dashboards step 1 (C-01…C-04): new chart types, dashboard frame, PDF / Excel / CSV export, status colours with icons. Review them in the chart gallery at `#/dev/charts`; see [doc 13](13-dashboard-kit.md). |
| 25 Oct 2026 | **Go given.** Started A (roles and access, A-01…A-08) and C step 1 (chart types, dashboard frame, exports, C-01…C-04) in parallel. Pending client answers use the plan's proposed defaults, marked "to confirm". |
| 25 Oct 2026 | Read the new roles document and the dashboards proposal. Wrote plan 11 and this checklist. **Waiting for your review** before building anything. Item 7 of the showcase list is missing. |
| 18 Oct 2026 | Team phone app (PWA), standalone period plans, PO approval switch, loading allowance + PO revisions, Truck planner role, Docker + per-folder scripts. All on branch `feat/team-app-po-revisions-truck-planner`. |
| 15 Oct 2026 | Client data loaded (131 SKUs, 30 ETS Sabrina trucks). Legs as new shipments, flexible warehouses, presentation deck, demo. |

---

## Already done (for reference)
| ID | Item | Status |
|---|---|---|
| D-01 | Office web app, field app (driver / loader / receiver), NestJS + PostGIS API, single server on :3101 | ✅ |
| D-02 | Multi-company: BTW, Nihna, Kivu, group view, letterheads, FX | ✅ |
| D-03 | Client data: 131 products, ETS Sabrina trucks and drivers, warehouses Goma / Gisenyi / Juba | ✅ |
| D-04 | Period plans as standalone suggestions; no overlap per company | ✅ |
| D-05 | PO director approval as a switch in `config.toml` (off by default) | ✅ |
| D-06 | Loading allowance ±10 %, alternatives, automatic `-rev001` PO revisions | ✅ |
| D-07 | Team phone app (PWA): bottom tabs, side menu, home menu + KPIs | ✅ |
| D-08 | Truck planner role: providers, trucks and drivers onboarding; queue; Truck desk; expenses | ✅ (to be reshaped in A-02) |
| D-09 | Docker image + `docker compose up`; per-folder `pnpm` scripts | ✅ |
| D-10 | Presentation (29 slides), architecture document v1.1, READMEs | ✅ (updated in E-01: 36 slides, v1.2) |
| D-11 | Tests: `pnpm verify` green, QA 638/638, API e2e 121 | ✅ |

## Open from before
| ID | Item | Status | Notes |
|---|---|---|---|
| P-01 | Truck planning across several POs (one truck, many POs) | ⏸ | Needs the truck-planning sheet image |
| P-02 | KBL receipt columns and calculations | ⏸ | Needs a KBL receipt |
| P-03 | `pnpm e2e` journeys script uses old demo data | ✅ | New roster; no PO approval step; no-price hand-over; agreed price by Testfie; damage reason; new re-export journey Asie → Yonas. 99/99 steps on its own DB `btw_e2e` / :3197 |

---

## A. Users, roles and access
| ID | Item | Owner | Status | Notes |
|---|---|---|---|---|
| A-01 | Real roster in seed and demo: Daniel, Michael, Kabonge, Testfie, Joel, Eric, Moses, Asie, Yonas, drivers; retire made-up users | agent | ✅ | Roster seeded in mock + server; Michael and SBL-loader phones are placeholders; spellings to confirm (Q10) |
| A-02 | Role shapes per roles document §4:<br>• Kabonge = planner + static data<br>• Testfie = truck follow-up officer (expenses, agreed price, fees, GBI Mombasa loading, static data view only)<br>• Asie = receiver + warehouse + re-export<br>• Yonas = receiver + warehouse | agent | ✅ | `truck_planner` relabelled Truck follow-up officer; new role `reexport`; doc 12 §2 |
| A-03 | Access matrix §7 in API, mock and UI, including "Own" scopes (buyer–supplier pairs, loading points, warehouses) | agent | ✅ | `packages/api/src/access.ts`; `users.pairs`, `users.route_ids`; QA person × feature matrix |
| A-04 | Hide prices and payments:<br>• loaders: none; agreed price moves from the loader hand-over to Testfie<br>• receivers: no purchase prices or margins<br>• drivers: nothing financial | agent | ✅ | Price removed from hand-over; `POST /shipments/:id/agreed-price`; "not recorded" counted in Truck desk + reports |
| A-05 | Static-data editing: companies, suppliers, goods, receiving companies (room for +2 companies, +3 suppliers), with change history | agent | ✅ | Limits 5 companies / 7 suppliers (to confirm); history = audit log; Kabonge's rights to confirm |
| A-06 | Routes: add Uganda → Congo, Mombasa → Congo, Tanzania → Congo; name them per §3; assign to users | agent | ✅ | `r-kla-goma`, `r-msa-goma`, `r-mwz-goma` via the Gisenyi/Goma border; routes renamed per §3; optional route scope per user |
| A-07 | Audit log screen for directors (search, before/after values) | agent | ✅ | `#/audit`, `GET /v1/audit`, before/after values, activity sparkline |
| A-08 | Users screen: assign companies, warehouses, routes and pairs; last login | agent | ✅ | Pairs grid, routes, warehouses, loading points, last sign-in |

## B. Warehouse and money data
| ID | Item | Owner | Status | Notes |
|---|---|---|---|---|
| B-01 | Warehouse expenses: offloading, storage, salary, rent, utilities, damaged goods; by warehouse, company, month | agent | ✅ | `#/warehouse-expenses` + phone Expense sheet; receivers Own, directors Full; receipt photo; USD at month rate |
| B-02 | Warehouse inventory recording: stock count, adjustments, moved out, damaged write-off | agent | ✅ | `#/warehouse-stock` + phone Stock count; received / damaged / short / moved out / held; quantities only |
| B-03 | Re-export orders: Asie raises and loads Rwanda → Juba for Yonas | agent | ✅ | `#/re-exports` + phone; shipment ref `ASIE-RX-…`; Yonas acknowledges; follow-up Testfie (Q3 to confirm) |
| B-04 | Agreed transport price recorded by Testfie after loading; fee tracking paid / part / unpaid against a reference, with age | agent | ✅ | `#/transport-fees`, `GET /finance/fees`; amber 14 / red 30 days (`[fees]`, Q9); expenses per trip and leg |
| B-05 | Selling price per product set by the directors + target-margin helper | agent | ✅ | `#/selling-prices`; per warehouse + company default, effective dates; sales default to it (Q6) |
| B-06 | Landed cost v2 = goods + truck + warehouse expense share (per product and per truck) | agent | ✅ | `packages/api/src/performance.ts`; split `[costs] allocation = "quantity"` (Q5); worked example in doc 14 §4 |
| B-07 | Combined performance report + profit margin at product, warehouse, company and whole-business level | agent | ✅ | `#/performance`, `GET /reports/performance` (directors); + receiving-company level, fast / slow, per truck |
| B-08 | Shortage and damage **reason** on acknowledgement lines (for the Pareto chart) | agent | ✅ | Phone receive sheet + API validation; seeded history; list to confirm (Q12) |
| B-09 | Receiving-company accounting (P&L, retained earnings, dividends) | — | ❓ | Scope (Q7) |

## C. Dashboards
**Step 1: building blocks**

| ID | Item | Status | Notes |
|---|---|---|---|
| C-01 | New chart types: waterfall, quadrant scatter, Pareto, horizontal stacked bars, stage/funnel bars, grouped bars + gap table, ageing stacked bars, bullet / stock-cover bars, triage matrix, Kanban board, box plot | ✅ | Built + KPI scorecard, exception list, stock-cover bands, trend line. Gallery `#/dev/charts` (dev/demo). [Doc 13](13-dashboard-kit.md) |
| C-02 | Dashboard frame: definition, unit/currency, date range, scoped filters, drill-down, freshness label, "no data yet" | ✅ | `DashboardPanel` + `DashboardGrid` (one column on phones). Wiring real data/scopes comes with each dashboard (step 2) |
| C-03 | Export to PDF, Excel and CSV | ✅ | In every panel; Excel and PDF written in the browser, no new dependency, lazy chunks. PDF includes the chart (light theme) + table |
| C-04 | Status colours with icons or labels everywhere (green / amber / red / grey) | ✅ | `charts/status.ts` + `StatusBadge` used by the new components. Older screens keep their badges until their dashboards are rebuilt |
| C-05 | Role home screens (web + phone) built only from that user's dashboards | ✅ | Dashboards document §10. **Phone part done** ([doc 16](16-phone-home-screens.md)): directors, Kabonge, Testfie homes + drill-down lists; Asie / Yonas strip on the receiver screen; loaders' today list. **Web part done** ([doc 15](15-dashboards.md)): `#/` shows each person's own dashboards (directors executive overview first; Kabonge purchasing; Testfie trucks and fees; loaders today's loading; Asie / Yonas warehouse), `#/dashboards/<group>` per feature group |

**Step 2: P1 dashboards** (★ = showcase visual you sent)

| ID | Dashboard | For | Status |
|---|---|---|---|
| C-P1-01 | Executive overview ★1 (KPI scorecard + exception list) | Directors | ✅ web `#/dashboards/business` |
| C-P1-02 | Combined performance | Directors | ✅ web `#/dashboards/business` |
| C-P1-03 | Profit and margin ★2 (waterfall) | Directors | ✅ web `#/dashboards/business` |
| C-P1-04 | Landed cost per product (stacked bars) | Directors | ✅ web `#/dashboards/business` |
| C-P1-05 | Landed cost per truck | Directors | ✅ web `#/dashboards/business` |
| C-P1-06 | Selling price & target margin helper | Directors | ✅ web `#/dashboards/business` |
| C-P1-07 | PO pipeline (stage bars) | Kabonge, Directors | ✅ web `#/dashboards/purchasing` |
| C-P1-08 | Ordered vs loaded vs delivered | Kabonge, Directors | ✅ web `#/dashboards/purchasing` |
| C-P1-09 | Today's loading list (no prices) | Loaders, Testfie | ✅ web `#/dashboards/loading` |
| C-P1-10 | Loading status | Kabonge, Directors | ✅ web `#/dashboards/loading` |
| C-P1-11 | Live fleet board (Kanban) | Testfie, Directors | ✅ web `#/dashboards/fleet` |
| C-P1-12 | Delayed trucks | Testfie, Directors | ✅ web `#/dashboards/fleet` |
| C-P1-13 | Truck issues | Testfie, Directors | ✅ web `#/dashboards/fleet` |
| C-P1-14 | Driver status updates | Testfie | ✅ web `#/dashboards/fleet` |
| C-P1-15 | Agreed transport price vs actual | Testfie, Directors | ✅ web `#/dashboards/fees` |
| C-P1-16 | Transport fee payments | Testfie, Directors | ✅ web `#/dashboards/fees` |
| C-P1-17 | Unpaid & ageing fees | Directors | ✅ web `#/dashboards/fees` |
| C-P1-18 | Expenses per truck | Testfie, Directors | ✅ web `#/dashboards/fees` |
| C-P1-19 | Incoming deliveries | Asie, Yonas | ✅ web `#/dashboards/deliveries` + phone |
| C-P1-20 | Received, damaged, short | Asie, Yonas, Directors | ✅ web `#/dashboards/deliveries` |
| C-P1-21 | Stock on hand ★6 (stock-cover bars) | Asie, Yonas, Directors | ✅ web `#/dashboards/warehouse` |
| C-P1-22 | Stock in transit | Directors, Asie, Yonas | ✅ web `#/dashboards/warehouse` |
| C-P1-23 | Warehouse expenses | Asie, Yonas, Directors | ✅ web `#/dashboards/warehouse` |
| C-P1-24 | Sales summary (cash / credit / batch) | Directors | ✅ web `#/dashboards/sales` |
| C-P1-25 | Customer balances (ageing) | Directors | ✅ web `#/dashboards/sales` |
| C-P1-26 | Users and logins | Directors | ✅ web `#/dashboards/admin` |
| C-P1-27 | Audit log | Directors | ✅ web `#/dashboards/admin` |
| C-P1-28 | Alerts centre (list + triage matrix) | Directors, Testfie, Kabonge | ✅ web `#/dashboards/admin` |

**Pulled forward from P2**

| ID | Dashboard | Status | Notes |
|---|---|---|---|
| C-X-01 | Fast and slow products ★3 (quadrant scatter) | ✅ | `#/dashboards/business` |
| C-X-02 | Border and stop analysis ★4 (route × stop heatmap) | ✅ | `#/dashboards/fleet` |
| C-X-03 | Delivery losses ★5 (Pareto) | ✅ | `#/dashboards/deliveries` (reasons from B-08) |
| C-X-04 | Showcase item 7 | ❓ | Text and screenshot didn't come through |

**Step 3: later releases**

| ID | Item | Status |
|---|---|---|
| C-P2 | 20 P2 dashboards (comparisons, trends, approvals, data completeness, offline sync monitor, …) | ⬜ |
| C-P3 | 8 P3 dashboards (supplier, provider and warehouse comparisons, retained earnings, digest) | ⬜ |

## D. Phone app alignment
| ID | Item | Status |
|---|---|---|
| D-A1 | Home screens per person in the team app (Kabonge, directors, Testfie) | ✅ Directors: scorecard + top exceptions + quick links; Kabonge: PO pipeline, ordered/loaded/delivered, ageing, plan vs actual, alerts; Testfie: live fleet chips, follow-ups (delayed, issues, silent drivers, agreed price, unpaid fees), Load at GBI Mombasa; Asie / Yonas and loaders on their field screens — [doc 16](16-phone-home-screens.md) |
| D-A2 | Asie and Yonas: warehouse expenses and stock entry on the phone; Asie re-export | ✅ |
| D-A3 | Loader screen without prices; Testfie can load at GBI Mombasa | ✅ |
| D-A4 | "Last synced" time on offline screens | ✅ Status pill on driver / loader / receiver ("Online · Synced 4 min ago", "Waiting to send 2", "Offline"), kept across restarts; team homes and lists show the same line — [doc 16](16-phone-home-screens.md) §3 |

## E. Docs, tests, demo
| ID | Item | Status |
|---|---|---|
| E-01 | Update the deck and the architecture document for the new roles and dashboards | ✅ Deck 36 slides (screenshots in `docs/presentation/assets/`); architecture v1.2, 10-page PDF + Word |
| E-02 | QA: access matrix person × feature, warehouse expenses, re-export, landed cost v2, exports | ✅ QA 1,108 / 1,108 (`access`, `security` person × feature, `money`, `dashboards` suites); e2e 99 / 99 incl. re-export; push-check race fixed. Browser export clicks are covered by the chart gallery only |
| E-03 | Demo refresh with the named users | ✅ |

## Questions waiting for answers
| Q | Question | Status |
|---|---|---|
| Q1 | Showcase item 7: resend text and screenshot | ❓ you |
| Q2 | Who raises Nihna–GBI POs; who loads at SBL Tanzania | ❓ client |
| Q3 | Who follows up the Rwanda → Juba re-export trucks | ❓ client |
| Q4 | Who approves truck payments; who handles sales and trip financials | ❓ client |
| Q5 | Split of shared truck and warehouse expenses: by quantity or by value (we propose quantity) | ❓ client |
| Q6 | Who sets selling prices when the directors are away | ❓ client |
| Q7 | Receiving-company accounting scope: Asie and Yonas only, or every company? Who records it? | ❓ client |
| Q8 | Do other Asie and Yonas staff need logins? | ❓ client |
| Q9 | Unpaid fee flag: 2 weeks or 1 month (we propose amber at 2 weeks, red at 1 month) | ❓ client |
| Q10 | Spelling: Testfie / Yonas; do Daniel and Michael have the same access? | ❓ client |
| Q11 | Loading queue ordering: Testfie, Kabonge or both? | ❓ client |
| Q12 | Shortage and damage reason list | ❓ client |

## F. Page design (docs/17) — built 27 Oct 2026 ([doc 17 §7](17-page-design-review.md))
| ID | Item | Status |
|---|---|---|
| F-0a | Fix USD 3,050,000 agreed-price bug + amount/currency sanity checks ([doc 18 §4](18-metrics.md)) | ✅ |
| F-0b | One metric registry so the same figure matches on every page ([doc 18](18-metrics.md)) | ✅ |
| F-0c | Remove spec codes and stale labels from UI text (+ lint check `scripts/check-ui-text.mjs`) | ✅ |
| F-1 | Work pages open on their list with a summary strip; remove 8 Overview tabs | ✅ |
| F-2 | Merge overlapping pages (Stock, Transport costs, Truck desk tabs, Map view); retire Reports and Sales velocity | ✅ |
| F-3 | Phone alignment, tests, docs, demo | ✅ (deck / demo refresh not redone) |
