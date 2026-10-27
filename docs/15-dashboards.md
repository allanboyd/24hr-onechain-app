# 15 — First-release dashboards (P1) and role home screens (web)

Built 25 Oct 2026 from plan [11](11-roles-and-dashboards-plan.md) §C step 2, the client's dashboards proposal
(`docs/inspiration/Dashboards_by_Feature_Analyst_Led_Visualizations.docx`, §1–§10) and the kit in [13](13-dashboard-kit.md).
Access follows [12](12-roles-access.md) §2; the money data comes from [14](14-warehouse-money.md). Tracker: [CHECKLIST](CHECKLIST.md) C-05, C-P1-01…28, C-X-01…03.
The phone app's home screens (D-A1) are a separate piece of work.

## 1. Where to find them

| Route | What |
|---|---|
| `#/` **Home** | **One page with tabs** (26 Oct 2026): *My dashboards* (the person's own set, §3; directors: the Today view, §3.1) first, then one tab per feature group they may open (Business, Purchasing, Loading, Fleet, Fees & expenses, Deliveries, Warehouse, Sales, Alerts & admin), and for directors in the Group view *Companies* (side by side). Every web user starts here. |
| `#/dashboards/<group>` | Opens Home on that group's tab (`business`, `purchasing`, `loading`, `fleet`, `fees`, `deliveries`, `warehouse`, `sales`, `admin`). |
| `#/overview` | Opens Home on the *Companies* tab (directors, Group view); the separate command view page was removed. |
| Analysis sections (27 Oct 2026) | Under each feature tab's dashboards: the reports of the retired Reports and Sales velocity pages and the charts of the removed page Overview tabs ([doc 17 §7.4](17-page-design-review.md)): Purchasing (Orders, Planned vs actual, Purchase planning), Loading (Loading queues), Fleet (Trucks and deliveries, Logistics report), Fees & expenses (Trip costs, Landing cost report), Warehouse (Fast and slow products, Stock positions, Stock report, Sales velocity), Sales (Sales report, Quarterly review). Old `#/reports?r=…` and `#/analytics` links open the matching tab. |

Every panel uses `DashboardPanel`: metric definition (ⓘ), unit / currency, date range, freshness ("Updated …" = time of the
**newest underlying record**, amber after 30 days without a new record; live panels 6–12 h), **View data**, **Export** CSV / Excel / PDF,
a drill-down link to the existing list or detail screen, and "No data yet" when there are no records (values are `null`, never 0).
Status colours always come with an icon and a word (C-04).

**Filters** (one bar per page): period (last 7 / 30 / 90 days, this month, last month, year to date), supplier, route, warehouse,
product — the choices come from the API and contain only what the person may see; the company is the top-bar switcher (Group
view = consolidated, read-only). **Currency** (directors): USD, KES, UGX, TZS, RWF converted at the latest approved month-average rate.

## 2. The dashboards

Who: D = Daniel, Michael · K = Kabonge · T = Testfie · L = loaders (Joel, Eric, Moses) · A/Y = Asie, Yonas (+ Asie re-export).

| ID | Dashboard (key) | Who | Question | Visual | Data source | Drill-down |
|---|---|---|---|---|---|---|
| C-05 | Today (`director-today`) | D | What needs a decision today; where do we stand? | KPI strip + trend + decision list + stock ring + distribution + top products (§3.1) | performance report, truck desk, alerts, stock items, sales, payments, fee rows | each card |
| C-P1-01 ★1 | Executive overview (`exec-overview`) | D | Where does the business stand today? | `KpiScorecard` (trucks on the road, delayed, orders awaiting loading, sales, profit, margin vs previous period, stock value, open alerts) + `ExceptionList` (delayed trucks, critical / high alerts) | trucks desk, PO facts, performance report (landed cost v2), alerts | each tile; alerts centre |
| C-P1-02 | Combined performance (`combined-performance`) | D | Totals at product / warehouse / company / business level | link card (sales, profit, margin, landed per case) | `performanceReport` | `#/performance` |
| C-P1-03 ★2 | Profit and margin (`profit-margin`) | D | How do sales become profit? | `Waterfall` sales → goods → truck → warehouse → other → profit + `ColumnsLine` (monthly goods cost / truck + warehouse + other / profit, margin % line; new chart file) | `performanceReport` per month (6 months) | `#/performance` |
| C-P1-04 | Landed cost per product (`landed-product`) | D | What makes up landed cost per case? | `StackedBarH` goods / truck / warehouse per case | performance rows (product) | `#/performance` |
| C-P1-05 | Landed cost per truck (`landed-truck`) | D | What did each truck cost? | stacked bars by cost category + table, above average (> 10 % over the mean per case) flagged | trip costs (USD) | `#/transport-costs?tab=trips` |
| C-P1-06 | Selling price & target margin (`selling-price`) | D | Do prices meet the target margin? | `Gauge` + products below target with the price needed | performance rows + selling prices | `#/selling-prices` (calculator) |
| C-P1-07 | PO pipeline (`po-pipeline`) | K, D | How many orders at each stage? | `StageBars` planned → raised → loading → dispatched → delivered (count + value); click a stage → its orders listed with links | plans, POs, loadings, shipments, acks | `#/pos/:id`, `#/plans/:id` |
| C-P1-08 | Ordered vs loaded vs delivered (`ordered-loaded-delivered`) | K, D | Where do quantities go missing? | `GroupedBars` + `GapTable` | root order lines, loadings, acknowledgements | `#/pos/:id` |
| C-P2 (§10) | Open orders (`open-orders`) | K, D | Which orders wait to load? | table with age bands < 3 / 3–7 / > 7 days | PO facts | `#/pos/:id` |
| C-P2 (§10) | Plan vs actual (`plan-vs-actual`) | K, D | Is purchasing following the plan? | existing `PlanUsedTile` | `reports.plannedVsActual` | `#/period-plans` |
| C-P1-09 | Today's loading list (`loading-list`) | L, T (GBI), D | What do I load today? | cards with status chips (ready to load / waiting for a truck / loaded) + queue — **no prices** | loadings, waiting list | `#/trucks?tab=queues` |
| C-P1-10 | Loading status (`loading-status`) | K, D | How far is each order loaded? | progress bar per order + document / photo counts | PO facts | `#/pos/:id` |
| C-P2 (§10) | Dispatched today (`dispatched-today`) | L, D | Which trucks left in 24 h? | count tiles + list by loading point | shipments | `#/shipments/:id` |
| C-P1-11 | Live fleet board (`fleet-board`) | T, D | Where is every truck? | `KanbanBoard` loaded / in transit / at border / stopped-delayed / arrived, grouped by route; faded after 12 h without an update | truck desk (`trucks.ts`) | `#/shipments/:id` |
| C-P1-12 | Delayed trucks (`delayed-trucks`) | T, D | Which are late, why, who acts? | table by days late with severity bar and owner | truck desk, issues | `#/shipments/:id` |
| C-P1-13 | Truck issues (`truck-issues`) | T, D | Open issues; repeats? | open-issues table (days stopped) + bars by truck and provider | leg issues | `#/shipments/:id` |
| C-P1-14 | Driver status updates (`driver-updates`) | T, D | Which trucks have gone quiet? | timeline (48 h: check-ins, issues, GPS, source) + last-update badges, amber > 6 h, red > 12 h | leg passes / issues / pings | `#/shipments/:id` |
| C-X-02 ★4 | Border and stop analysis (`border-stops`) | D | Where do trucks wait? | `Heatmap` route × border / weighbridge, average days with the trip count in each cell (≥ 90 days) | checkpoint passes | `#/shipments?show=border` |
| C-P1-15 | Agreed price vs actual (`agreed-vs-actual`) | T, D | Did trucks cost what was agreed? | paired bars + variance (red when over); actual = transport + loading / storage / other (no duties or clearing) | fee rows (`finance/fees`) | `#/shipments/:id` |
| C-P1-16 | Transport fee payments (`fee-payments`) | T, D | Paid / part / unpaid, against which reference? | chips + payment progress + reference search | fee rows | `#/transport-costs` |
| C-P1-17 | Unpaid & ageing fees (`unpaid-fees`) | D | Who is owed, how old? | `AgeingBars` by provider (bands from `[fees]`) | `M.feeAgeing` | `#/transport-costs` |
| C-P1-18 | Expenses per truck (`truck-expenses`) | T, D | What does each trip cost? | stacked bar per trip by category; click → its legs | fee rows (costs with leg) | `#/shipments/:id` |
| C-P1-19 | Incoming deliveries (`incoming`) | A, Y, D | What is coming, what to acknowledge? | cards (acknowledge first, then by ETA) — quantities only | shipments | `#/shipments/:id` |
| C-P1-20 | Received, damaged, short (`received-damaged-short`) | A, Y, D | What arrived damaged or short? | `StackedBarH` per delivery + photos / signature | acknowledgements | `#/shipments/:id` |
| C-X-03 ★5 | Delivery losses (`delivery-losses`) | D, A, Y | Which causes drive losses? | `Pareto` (≥ 90 days) | `M.lossByReason` (B-08 reasons) | acknowledged shipments |
| C-P1-21 ★6 | Stock on hand (`stock-on-hand`) | A, Y, D | Running out or not moving? | `StockCoverBands` (≤ 7 … > 60 days, click a band) + `StockCoverBars` (min 14 / slow 60 days, to confirm) + held / moved out / damaged bars | `M.warehouseStock` (quantities) | `#/stock` |
| C-P1-22 | Stock in transit (`stock-in-transit`) | D, A, Y | What is on the road, arriving when? | timeline by expected arrival day + totals per warehouse | shipments + ETA | `#/shipments/:id` |
| C-P1-23 | Warehouse expenses (`warehouse-expenses`) | A, Y, D | What do warehouses spend? | stacked monthly columns + category donut (same colours) | `M.expenseSummary` | `#/warehouse-expenses` |
| B-03 (§10) | Re-export orders (`reexports`) | Asie, Y, D | Where are the re-exports? | status list + "owner not assigned" tag | re-export orders | `#/re-exports` |
| C-P1-24 | Sales summary (`sales-summary`) | D | Cash / credit / batch, top products and customers | stacked columns by month + ranked bars | sales (USD, intercompany removed) | `#/sales` |
| C-P1-25 | Customer balances (`customer-balances`) | D | Who owes what, how old? | `AgeingBars` within terms / 1–30 / > 30 days overdue (terms 14 days, to confirm) | unpaid sales | `#/sales?tab=list&status=Unpaid` |
| C-P1-26 | Users and logins (`users-logins`) | D | Who uses the system? | count tiles + table with role chips, inactive (30 days) flagged | users + last sign-in | `#/users` |
| C-P1-27 | Audit log (`audit-log`) | D | Who did what? | activity sparkline + latest changes | `GET /audit` (browser) | `#/audit` |
| C-P1-28 | Alerts centre (`alerts`) | D, T, K | Which alert first? | `TriageMatrix` (impact × severity) + kind chips + `ExceptionList` (owner, due, status) | derived from the records the person sees: delays, quiet trucks, not acknowledged > 24 h, shortages / damages (14 days), unpaid fees (amber / red), agreed price missing, orders waiting > 3 days, stock < 7 days, warehouses without expenses this month | each alert's record |
| C-X-01 ★3 | Fast and slow products (`fast-slow`) | D | Which are slow and overstocked? | `QuadrantScatter` sales speed × days of stock (median speed, 60 days), bubble = stock value | performance rows | `#/stock` (now on Home · Warehouse) |

## 3. Home screens (C-05, web)

| Person | Home (in this order) |
|---|---|
| Daniel, Michael | **Today** (`director-today`, §3.1) — one curated daily view. Every other dashboard stays on its feature tab (Business, Purchasing, …, Companies in the Group view); each Today card links to the deeper tab. |
| Kabonge | PO pipeline · ordered vs loaded vs delivered · open orders · plan vs actual · alerts centre |
| Testfie | live fleet board · delayed trucks · truck issues · driver updates · agreed price vs actual · fee payments · expenses per truck · today's loading list (GBI Mombasa) |
| Joel, Eric, Moses | today's loading list · dispatched today — no prices or payments |
| Asie | incoming deliveries · received / damaged / short · stock on hand · warehouse expenses · re-export orders |
| Yonas | incoming deliveries · received / damaged / short · stock on hand · warehouse expenses |
| Drivers | field app only (the web sends them there; `GET /dashboards` → 403) |

Defined once in `packages/api/src/dashboards.ts` (`DASHBOARDS`, `HOME`, `homeFor`) and used by the web, the server and the mock.

### 3.1 Directors' Today view (26 Oct 2026)

Replaces the long list of separate panels on the directors' *My dashboards* tab. Built around one question: *what needs me today, and
is the business on track?* Every number has an ⓘ definition, its unit / currency and an "Updated …" time; missing data shows "No data
yet" (values are `null`, never 0). One call: `GET /v1/dashboards?keys=director-today` (key `director-today`, group `home`,
directors and admins only; everyone else 403). Company switch, Group view (consolidated, intercompany removed), period, warehouse and
currency apply as everywhere.

| Card | What it shows | Why a director looks at it | Opens |
|---|---|---|---|
| Sales (accent card) | Sales month to date vs the same days last month, daily sparkline | Is revenue on pace this month? | Sales tab |
| Profit · margin | Profit (landed cost v2, after other warehouse costs) and margin, change vs the same days last month (margin in pp) | Are we making money on what we sell, not just selling? | Performance |
| Cash to collect | Open customer balances, the overdue part (after 14 days' terms) and the share of this month's sales already paid; sparkline = balance left from each of the last 8 weeks | Is cash coming in, and who needs chasing? | Unpaid sales |
| Trucks on the road | In transit / at a border / delayed now, change vs a week ago, delayed count, arriving today, on-time % of the last 7 days' arrivals; 14-day sparkline | Is the pipeline moving; is anything stuck? | Fleet tab |
| Sales and profit | Daily sales and profit (30 / 90 days) or weekly (this year), legend toggles, CSV / Excel / PDF | Trend behind the KPIs — a dip shows up here first | — |
| Needs your decision today | Truck payments waiting for approval (value) · delayed or silent trucks (> 12 h) · fees unpaid past `red_days` · products under 14 days of stock · arrivals not signed for > 24 h · top-10 sellers with no price or below the target margin. Open items first (by severity), each with count, value, owner and a link; clear items folded under "n more all clear" | Only things a director can unblock — the action list for the morning | each row's list |
| Stock health | Cases by days of cover (at risk ≤ 7 d, low 8–14 d, healthy 15–60 d, overstocked > 60 d, no sales in 30 d), stock value at landed cost in the centre | Risk of running out vs cash tied up in slow stock | Warehouse tab |
| Sales distribution | By company (logos, Group view) or by warehouse (Gisenyi, Goma, Juba); last 7 days or the period | Where the sales come from; a company or warehouse falling behind | Sales tab |
| Top products | Top 8 by sales: product + pack, warehouses, cases per week, revenue, margin (amber under target), days of cover chip | The few products that carry the business: are they priced and stocked right? | Performance |

Purchase orders awaiting approval are not a row yet: POs are being reworked (Created → Sent → Loading → On the road → Delivered, with *Awaiting approval* only when the approval switch is on); add the row on that stage once it lands.

Left out on purpose (on the feature tabs instead): landed cost per product / truck, border heatmap, fee payments table, expenses
per truck, PO pipeline, users and logins — useful for analysis, but they rarely change today's decision.

Daily profit in the chart = sales − cases sold × that product's landed cost per case over the chart window (so the line is smooth and
comparable day to day); the Profit card uses the full performance report for its period. "Today" is left out of the chart until its
first sale so the line does not dip to zero every morning.

Layout: four KPI cards across (one accent card in brand navy, orange in dark mode), then a 2/3 + 1/3 grid — trend chart and top
products on the left, decisions, stock health and sales distribution on the right. 700–1100 px: decisions, chart and products full
width with stock + distribution side by side; under 700 px one column, decisions first; KPI cards 2 × 2 on phones. New pure-SVG
pieces (no Plotly on the home view): `components/charts/SmoothTrend.svelte`, `SparkArea.svelte`, `RingDonut.svelte`; screen
`screens/dash/today/{Today,TodayCard}.svelte` (lazy chunk).

## 4. API

`GET /v1/dashboards?keys=a,b,…&entityId&supplierId&routeId&warehouseId&productId&from&to` → `{ generatedAt, home, available, options, results }`
(no `keys` = the caller's home set). `GET /v1/dashboards/:key` → one result + `options`. Each result:
`{ key, title, data, definition, unit, currency, period, freshness, empty, pricesHidden, generatedAt }`.
- 404 unknown key; 403 a dashboard outside the person's audience, browser-computed ones (`plan-vs-actual`, `audit-log`), a company outside the scope, or a person with no dashboards (drivers).
- Scope: the server loads the company-wide data of the caller's company scope (`ReportsService.data`) plus expenses, selling prices, re-exports, waiting list, fee rows (`MoneyService.fees`, own rules) and users (directors); **`scopeSource`** then cuts it to the person (§7: Kabonge's pairs, loaders' loading points, receivers' warehouses, optional routes; prices and trip money dropped for loaders / receivers; sales and selling prices directors-only; truck costs directors + Testfie) and **`narrow`** applies the filters inside that scope. Same functions in the mock (`packages/api/src/mock/dash.ts`, lazy).
- Files: `packages/api/src/dashboards.ts` (catalogue, scope, builders), `apps/api/src/domain/dashboards.service.ts`, `apps/api/src/http/dashboards.controller.ts`; client `dashboards.get(keys, filter)`.

## 5. Web

`apps/web/src/screens/dash/`: `Home.svelte`, `Area.svelte`, `Board.svelte` (one call per page; fills rows so no panel sits alone),
`Filters.svelte`, `fmt.svelte.ts` (currency, formats, panel frame), `panels/{Business,Purchasing,Fleet,Money,Stock,Admin}.svelte`.
New chart `components/charts/ColumnsLine.svelte` (stacked columns + line on a second axis). All lazy: the old dashboard moved out
of the entry chunk, so the web entry went from 116.9 KB to ≈ 100 KB gz; the dashboards chunk ≈ 18 KB gz (+ the kit, Plotly lazily).

## 6. Tests

- `pnpm test` → `packages/api/test/dashboards.test.ts`: Today view (sales = performance revenue, daily adds up to the month, cash overdue ≤ total, trucks trend ends at now, 7 decision rows ordered open-first with owners and links, stock bands add up, distribution adds up, top products ordered, BTW vs Group, empty source → nulls, not for planners), catalogue (28 P1 + 3 pulled forward), home per person, audience rules, every builder over the demo data (definition / freshness / empty), waterfall adds up, landed cost parts add up, pipeline counts, filters, empty period → empty marker, per-person scope in the mock (Kabonge pairs, Testfie GBI list, loaders and receivers without money), pure `scopeSource` / `narrow`.
- `pnpm --filter @btw/server test:qa --only dashboards` (isolated `btw_qa_dash` on :3284): Today for Daniel and Michael (Group view by company, `X-Entity-Id` BTW, company filter, empty period), `director-today` 403 for Kabonge, Testfie, loaders, receivers and drivers, their homes unchanged; home sets, every server-built dashboard, company / supplier / route / period filters, `X-Entity-Id`, 404 / 403 cases, Kabonge never sees Nihna–GBI, Testfie GBI only, Joel / Eric / Moses their point and no prices, Asie / Yonas their warehouses and no values, filters cannot widen the scope.

## 7. To confirm (client)

| Decision we took | Question |
|---|---|
| Driver update gap amber 6 h, red 12 h | The "set number of hours"? |
| Stock cover minimum 14 days, slow above 60 days, for every product | Per product category? |
| Customer payment terms 14 days | Per customer? |
| Actual transport cost = transport + loading / offloading + storage + other (duties and clearing left out) | Which charges count as "actual transport"? |
| Alerts are worked out from the records (no separate alert store, no acknowledge / snooze yet) | Should alerts be assigned / closed by hand? |
| Directors also see today's loading list and dispatched today ("everything") | OK? |
