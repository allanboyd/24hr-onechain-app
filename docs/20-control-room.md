# 20 — Control room: patterns, pages, and queries

17 Nov 2026. Branch `plan/control-room`.

Source: the client's management report `supply_chain_control_room_report.html` and its rebuild spec
*Implementation Specification: Supply Chain Control Room*. Where those two differ, the HTML file wins.
This plan turns that report into panels on the Home tabs that already exist ([13](13-dashboard-kit.md), [15](15-dashboards.md), [18](18-metrics.md)).
No new page and no new route. Layouts are reviewed before any screen is built.

## Rules

1. **Use the tabs that exist.** Home stays `#/`, with My dashboards, Business, Purchasing, Loading, Fleet, Fees & expenses, Deliveries, Warehouse, Sales, Alerts & admin, and Companies. A control-room page becomes panels on the tab that already asks that question. The filter bar on Home is the filter bar.
2. **Reuse the component.** A share of a total is one `Donut` (`components/charts/Donut.svelte`, and Today's `RingDonut` folds into it). Variants are props: centre figure, slice labels, status tones. Where each $100 went, how clients pay, expense categories, stock cover and stock age are that one chart with different inputs. The same rule for the rest: `Waterfall`, `GroupedBars`, `ColumnsLine`, `StackedBarH`, `AgeingBars`, `StageBars`, `Heatmap`, `Pareto`, `KanbanBoard`, `KpiScorecard`. A new drawing is allowed only when none of these can show the question.
3. **The report is the target. Design v1 and v2 keep the small chart that already works.** The control room says what a tab should answer and in what order. The first dashboard kit (v1, [13](13-dashboard-kit.md) and [15](15-dashboards.md)) and the current Home (v2, Today and the question panels) keep a panel when it is the smaller, clearer version of that answer. We extend that panel. We do not put the report's chart beside its twin. [19](19-demo-report-review.md) already names the twins to fold under More detail.
4. **Look before building.** Each tab's layout and the full report list are in the review canvas. Nothing in §5 is implemented until that layout is agreed.

## 1. What the report is

One analysis shell for directors. Thirteen pages, one filter bar, every amount for the selected period, every time chart as the six months ending on the period's end date, every list highest first, every case count named as brand and pack, every bar and tile opening the records behind it.

| Page | Question it answers |
|---|---|
| Overview | Are we on pace, and what should I act on first? |
| Executive report | What is the good news, and which decisions are waiting? Printable. |
| Plans and orders | Did we buy what we planned, by month and by brand? |
| Stock run-out | What runs out, how old is the rest, is a truck already coming? |
| Fleet and delays | Where is each truck, and which route step ran long? |
| Sales and clients | Who bought, what was collected, who still owes? |
| Supplier balances | What cash is still with a supplier because they loaded short? |
| Expenses | Truck costs and warehouse costs, against the month and the route. |
| Bills and balances | Which transport bills and which clients are still open, and for how long? |
| Cash and transfers | What cash came in, what was paid, what was sent to the company account? |
| Opening and closing | Do stock, bills, client balances and sales reconcile across the period? |
| Documents | Where is the delivery note, GRN, invoice, credit note, receipt? |
| Warehouse performance | One warehouse, end to end: profit, plan, cost, price, stock. |

The reference builds this by embedding one JSON object in the page and redrawing the whole screen when a filter changes. That is the behaviour to match. It is not the way to load it. Section 6 is the replacement.

## 2. What stays as it is

- **Home** ([15](15-dashboards.md) §3.1) stays the morning screen. The control room is where a Today card goes for the longer view. Work pages (orders, shipments, stock lists, expenses) stay the place a person records something.
- **One definition per figure** ([18](18-metrics.md)). A tile on the control room calls the same function as Home and the work-page strip. New figures are added to the registry before a page shows them.
- **The dashboard kit** ([13](13-dashboard-kit.md)). New drawings are added there, with the gallery at `#/dev/charts`, the ⓘ definition, the unit, the period, the empty state, and CSV / Excel / PDF.
- **Access** ([12](12-roles-access.md)). Company scope, Kabonge's buyer–supplier pairs, Asie and Yonas's warehouses, no prices for loaders. Group view drops sales between our own companies (`counterparty_entity_id` set). Re-export orders stay out of "PO issued" and out of supplier balances.
- **Landed cost v2** ([14](14-warehouse-money.md)) is the cost used for profit, margin, stock value and the price floor. The report's perpetual weighted average is the same idea (receipts add goods + truck + warehouse expense; a sale takes the average). We do not keep a second profit.
- **Brand colours** come from `design-system/tokens.json`. The report is light-only and uses its own hex list. We keep light and dark, status as icon plus word, and orange as the brand accent. A warning stays amber so it is never read as the logo.

## 3. Decisions, where the report and the platform differ

Taken so the pages can be built. Each one is reversible if the client says otherwise. Section 10 lists what still needs a yes.

| Topic | Report | This plan |
|---|---|---|
| Profit | Revenue − weighted-average cost of sales, then a bridge that splits that cost into goods, truck, warehouse, other | Same bridge, fed by landed cost v2. "Other" is warehouse expense in a month with nothing received, which the registry already isolates. The bridge must add back to profit. |
| Part-paid sales | Treated as 50% collected, because the demo has no payment dates | Use `sales.paid`. A later payment moves the balance. Opening and closing can change after the sale, which the report could not show. |
| Payment types | Cash and Credit only | Keep Batch. It is its own slice on Sales and clients. |
| Customer terms | Days and a limit per client, edited in the page | Flat 14 days until a customer table exists (phase E). The page shows the registry's overdue figure and does not pretend the limit exists. |
| Delay | Four route steps in days, editable, "at risk" at 80% of the allowance | Home and the Truck desk keep the registry rule (on the road, 6 h behind plan). The Fleet page adds the four day-counts on top. It does not redefine `trucks-delayed`. |
| Stock cover | Critical under 10 days, low 10–20, enough, overstock over 90 | Keep the registry bands (at risk ≤ 7, low 8–14, healthy 15–60, overstocked > 60). The report's bands would make Home and the control room disagree. Ageing (0–30 / 31–60 / 61–90 / over 90, FIFO) is new and does not replace cover. |
| Truck cost names | Transit fee, tax clearance, clearing, entry cards, parking, O.C.C, manpower, road user fees. Offloading is a warehouse expense | Chart the cost kinds we store: Transport, Taxes & duties, Clearing & forwarding, Storage, Other. Loading & offloading on a trip stays a trip cost until the client confirms it moves to warehouse expenses. |
| A zero | "Empty states, zeros, no errors" | No rows in scope at all → "No data yet" (`null`). The period was queried and the sum is zero → show 0. A missing series is never drawn as a zero line. |
| Who edits thresholds | Anyone, stored in the browser | Directors, stored in `settings`, audited. Not in the first pages. |
| Assistant | Keyword matcher over the embedded JSON | Phase F. It reads the page payload already returned, plus the glossary. It does not scan tables and it does not call a model in v1. |
| Truck map | Schematic polyline, demo "no check-in" from a hash | Schematic polyline from `routes.stops`. Position from the latest ping on the open leg. No invented check-in. |

## 4. Design patterns

A page is a stack of these. A pattern is used for the question named here and not for a neighbouring one.

| Pattern | Question | Use | Do not use |
|---|---|---|---|
| **Score tile** | What is the number for this period? | `KpiScorecard` or a single tile: value, comparison with the previous window of the same length, sparkline of the six months. Click opens the slice. | A tile with no definition, or a tile that mixes "now" and "this period" without saying which. |
| **Act list** | What should a person do first? | `ExceptionList`, open items first, each with a count, a value, an owner and a link. Cleared items fold under "n more all clear". | A second alerts inbox. The list is computed from the snaps in §6. |
| **Bridge** | How does the top line become the bottom line? | `Waterfall`. Steps add up. A note under it: of each $100 of sales, how much was goods, truck, warehouse, other, profit. | A waterfall whose last bar is not the profit tile. |
| **Change story** | Why is profit up or down? | Three sentences from four numbers (cases, revenue, cost now and in the previous window): volume, price, cost. The three effects add up to the change. | A chart. This is prose next to the bridge. |
| **Outlook** | What might next month's sales be? | A band: forecast, low, high. Needs at least three complete months inside the six. Otherwise the card says there is not enough history. | A forecast drawn as if it were an actual month. |
| **Month columns** | How did this move over time? | `GroupedBars` or `ColumnsLine`, exactly six buckets, the last one ending on the period end (clipped, not a full month). Value labels when there are 14 points or fewer. | A daily line on these pages. Daily stays on Home's trend. |
| **Ranked bars** | Which brand, client, route or supplier is largest? | `StackedBarH` or the horizontal `BarChart`, one series. Label is brand and pack in full, sorted descending. A paired series when the question is plan against actual, or billed against paid. | A second bar component for a paired series. |
| **Share** | How is this total split? | The one `Donut`. Centre is the total. Slices are the parts. | A second pie, or a donut next to a ranked bar of the same split. |
| **Statement** | Does this period reconcile? | Rows: opening, plus, minus, closing. The closing of one period is the opening of the next. Bars repeat the same rows. | A statement that only shows the movement and hides the opening. |
| **Stage strip** | How many trucks or orders sit at each step right now? | `StageBars` or the fleet kanban. This is "as of the period end", labelled as such, not a period total. | Mixing stage counts into a period KPI without the word "now". |
| **Slice drawer** | What records make up the number I clicked? | `DetailDrawer`. Search, a Total row on amount columns, CSV of the whole slice. Averages, prices, per-case figures, dates and "days waiting" are not totalled. | Stuffing the rows into the chart response. The drawer fetches them (§7). |
| **Threshold table** | What allowance is this route or client held to? | A small editable table, directors only, saved in `settings`. Changing it recomputes the flags. Phase E. | Editing a number that the metric registry also defines, unless the registry reads that setting. |
| **Print sheet** | Can I hand this page over? | Executive report only. Print hides the nav, the filters and the assistant, and keeps the warehouse table and the decision list. | A print stylesheet on every page in v1. |

Shared rules, applied by the shell rather than by each page:

- Default period is the last 30 days. Presets: today, last 7 days, last 30 days, this month, last month, year to date, a chosen month, a chosen year, and from–to. A period with nothing in it renders the empty state.
- Supplier narrows the brand list to that supplier's brands. Both narrow every calculation on the page.
- Warehouse `all` is the sum of the warehouses the person may see. Summing the warehouse rows equals the combined row for sales, profit, cash and balances.
- Case counts read "Tusker Lager · 24 x 500 ml", never a sku alone.
- Under 780 px the nav becomes a horizontal scroller and the cards become one column. Score tiles go 2 × 2.

## 5. Where each report lands

Who already follows [15](15-dashboards.md): directors on every tab, Kabonge on Purchasing, Testfie on Fleet and Fees, loaders on Loading, Asie and Yonas on Deliveries and Warehouse. Companies stays the Group comparison. Nothing in the report adds a tab.

The open tab is the only one that asks for its new numbers. Those numbers come from the rollup in §6, not from widening today's load-everything call. A panel that already exists keeps its current data until it is moved.

| Tab | From the report | What we do with it |
|---|---|---|
| **My dashboards** | The report's Overview, in short form, plus the small v1 charts a director acts on | Today stays on top (v2): KPI sparklines, the sales and profit trend, the decision list, the stock Donut, who owes us, sales by warehouse, top products. Under it, the same components again at a smaller size: the waterfall and the three sentences, the $100 Donut, six-month columns, brands by margin, a pipeline strip, plan against issued, and a short running-out table. The feature tab keeps the full panel. Landed cost per truck, the border heatmap, the Pareto, the fleet board and the registers stay on their own tabs. |
| **Business** | Overview and the executive report | Keep the scorecard, the waterfall, the monthly columns, landed cost per product, landed cost per truck, the selling-price gauge. Under the waterfall: the three sentences and the outlook, read from those same columns. One `Donut` for where each $100 went. Best and weakest brands are a ranked bar on the profit panel. Good news and decisions are the scorecard and the exception list. Print is the panel PDF. |
| **Purchasing** | Plans and orders, supplier balances | Keep the pipeline, the gap chart and open orders. Extend plan vs actual to six months with the `GroupedBars` it already uses. Supplier credit and short loads are a ranked bar and a table on this tab. |
| **Loading** | — | Keep today's list, loading status and dispatched today. The report has no smaller version of these. |
| **Fleet** | Fleet and delays | Keep the kanban, the delayed table, issues, quiet trucks and the border heatmap. Days against the route allowance are `GroupedBars` (actual, allowed). The map stays the shipments map. |
| **Fees & expenses** | Expenses, bills, the cash statement | Keep agreed vs actual, the payment table, `AgeingBars` (those are the waiting buckets) and expenses per truck. Trip costs by month reuse `ColumnsLine`. The cash statement is a table on this tab: opening, collected, bills paid, transferred, cash in hand. |
| **Deliveries** | — | Keep incoming cards, received / damaged / short, and the Pareto. They are the small charts that already answer the question. |
| **Warehouse** | Stock run-out, warehouse performance | Keep cover bands, cover bars, in transit, the expense columns and their `Donut`, the fast/slow scatter, re-exports. Age is a variant of that `Donut`, not a second one. Running out with a truck number and an ETA is a table. Days of cover reuse `Heatmap`; the velocity heatmap under More detail folds into it. Choosing a warehouse in the filter is the warehouse performance view. |
| **Sales** | Sales and clients, client half of bills, the sales statement | Keep the stacked cash / credit / batch columns, the customer ranking and `AgeingBars`. Collected and still to collect are two figures on the sales summary. How clients pay is the `Donut`. The sales statement (opening, new, closing) is a table under it. |
| **Alerts & admin** | Documents | Keep the triage matrix, users, audit and the completeness checklist. The checklist is the way into a missing document. A register, when it exists, sits under More detail. |
| **Companies** | — | Keep the side-by-side comparison. |

More detail stays closed. A report under it that repeats a question panel is removed, as [19](19-demo-report-review.md) lists: stock age, where stock stands, days of cover, the second plan-vs-actual chart, the velocity heatmap. The full report list, and a layout of each tab, is the review canvas. Figures there are a layout sample, not live data.

## 6. Queries

### 6.1 What is slow today

`GET /v1/dashboards` loads every sale, shipment, acknowledgement, trip cost, payment, plan, purchase order, loading and stock move for the caller's companies, then walks them in process (`DashboardsService.get` → `ReportsService.data`). Product quantities sit inside JSON (`sales.lines`, `plans.lines`, `period_plans.lines`, `loadings.lines`, `acks.lines`), so a brand total cannot use an index.

That is acceptable for the home set on the demo. It will not carry the extra panels (six-month bridge, FIFO age, a price regression, a drill-down on every bar) if they are added to that same load. The report avoided the cost by precomputing everything into `D`. We precompute the same grains in Postgres, and the open tab reads only its own grain.

### 6.2 Three stores

**Line facts.** Written in the same transaction as the document, so a read never unnests JSON.

| Table | One row is | Written when | Leading index |
|---|---|---|---|
| `fact_sale_line` | One product on one sale | A sale is saved | `(entity_id, at)` and `(entity_id, warehouse_id, product_id, at)` and `(entity_id, customer, at)` |
| `fact_receipt` | One product on one acknowledgement, with goods, truck and warehouse USD from landed cost v2 for that shipment | An acknowledgement is saved | `(entity_id, warehouse_id, product_id, at)` |
| `fact_po_line` | One product on the latest external PO revision | A PO is issued or revised | `(entity_id, date)` and `(entity_id, supplier_id, date)` |
| `fact_plan_month` | One product in one plan month, cases and value | A period plan is saved | `(entity_id, month, product_id)` |
| `stock_lot` | Cases still left from one receipt, with their cost | Receipt inserts a lot; a sale or a transfer consumes the oldest lots | `(entity_id, warehouse_id, product_id, received_at)` where `cases_left > 0` |

`supplier_id` is copied onto the sale and receipt rows from the product, so a supplier filter does not join `products` on the hot path. `counterparty_entity_id` is copied onto the sale row so the Group view can drop intercompany sales without joining `sales`.

**Monthly rollup.** One row per month × company × warehouse × product.

`roll_month (month, entity_id, warehouse_id, product_id, cases_sold, revenue_usd, cogs_usd, cases_received, goods_usd, truck_usd, warehouse_usd, cases_ordered, po_value_usd, planned_cases, planned_value_usd)`

Primary key on the four keys. At three companies, five warehouses, 200 products and 36 months this is about 100,000 rows. A page that asks for six months of one company touches a few thousand, and the aggregation is a primary-key range, not a scan of the facts.

`refresh_roll(entity_id, month)` rebuilds only that month from the facts and the plan rows, and it runs at the end of the transaction that changed the month. A nightly job runs the same function for any month touched since the last run, so a missed call repairs itself. The request path never refreshes.

Trip costs and warehouse expenses are a second, smaller roll because they are not per product:

`roll_cost_month (month, entity_id, warehouse_id, route_id, kind, amount_usd)` with `kind` in the cost kinds plus the warehouse categories. Primary key on those columns.

**Snapshots, "as of now".** Small, rebuilt for the rows that changed, never by replaying history on a read.

| Snapshot | Holds | Rebuilt |
|---|---|---|
| `snap_stock` | Cases, value, average cost, sold in 30 days, days of cover, last sale, FIFO age buckets and their value, speed class | The warehouse–product whose lot or 30-day sales changed |
| `snap_fleet` | Open shipments only: stage, route, warehouse, truck, driver, departed, ETA, days used, days allowed, days late, latest ping, fraction along the route | The shipment whose leg changed. Delivered shipments drop out. |
| `snap_price` | Break-even, safe floor, price for a 10% margin, system proposed price, status | Nightly, and when a receipt is added. Needs two receipts. Drift is the fitted monthly change in cost, clipped to −2% … +6%, as in the spec §6.3. |
| `snap_bill` | One transport bill per shipment: billed, paid, balance, bill date, route, warehouse, provider, truck, waiting days, status | A trip cost or an approved payment on that shipment |

Age buckets are a sum over `stock_lot` rows that still have cases. They are not a walk of the stock ledger.

Price status: below break-even is Loss, below the safe floor is Risk, below the 10% price is Below policy, otherwise OK. The proposed price is the greater of the 10% price and the safe floor. The regression is the only heavy calculation, and it is off the request path. Overview reads the status counts.

Speed class uses the registry's cover for "running out", and the report's index only as a label on the stock page: velocity against the average velocity of that brand, Fast ≥ 120, Normal ≥ 80, Slow ≥ 40, Stagnant when nothing sold in 30 days or the index is under 40. The label is stored on `snap_stock` so the page does not recompute it.

### 6.3 The shape of a page query

Every page is at most four statements.

1. **Tiles and the six months**, one statement against `roll_month`. The previous window is a second range in the same statement, so the comparison is not a second round trip.
2. **A ranked list**, `ORDER BY … DESC LIMIT 20`, from the roll or a snap.
3. **Flags**, from a snap, already classified.
4. **The drill**, only after a click, and never inside the page payload.

A period that clips a month scales the plan by `days of that month inside the period / days in the month`. Sales, costs and receipts are not scaled: they sum the days that fall inside the period. Because the roll is monthly, a clipped first or last month is the one case that reads `fact_*` for those days and the roll for the complete months in between. A default "last 30 days" that sits inside one month is a single fact range, still indexed.

```sql
-- Overview tiles + six month columns. $products is null, or the brand's ids.
select month,
       sum(revenue_usd)  as sales,
       sum(cogs_usd)     as cogs,
       sum(cases_sold)   as cases,
       sum(goods_usd)    as goods,
       sum(truck_usd)    as truck,
       sum(warehouse_usd) as warehouse
from roll_month
where entity_id = any($scope)
  and month between $m0 and $m5          -- six months ending on the period end
  and ($wh is null or warehouse_id = $wh)
  and ($products is null or product_id = any($products))
group by month
order by month;
```

```sql
-- Opening and closing in one pass. Closing = opening + in − out.
select
  sum(qty) filter (where at <  $from)                                        as opening_cases,
  sum(qty) filter (where at >= $from and at < $to and kind = 'receipt')      as received,
  sum(qty) filter (where at >= $from and at < $to and kind = 'sale')         as sold,
  sum(qty) filter (where at >= $from and at < $to and kind = 'transfer-out') as moved_out
from stock_moves
where entity_id = any($scope)
  and ($wh is null or warehouse_id = $wh)
  and at < $to;
```

That stock statement needs an index the table does not have yet: `(entity_id, warehouse_id, at)`. The current `(entity_id, warehouse_id, product_id)` index does not serve "every product up to this day".

```sql
-- Still to collect this period, and everything owed at the end date.
select
  sum(revenue_usd - paid_usd) filter (where at >= $from and at < $to) as still_to_collect,
  sum(revenue_usd - paid_usd) filter (where at < $to)                  as owed
from fact_sale_line
where entity_id = any($scope)
  and counterparty_entity_id is null
  and at < $to;
```

```sql
-- Fleet map. Open shipments only; the latest ping is one index lookup per leg.
select f.*, p.lat, p.lng, p.at as ping_at
from snap_fleet f
left join lateral (
  select lat, lng, at from positions
  where leg_id = f.leg_id
  order by at desc
  limit 1
) p on true
where f.entity_id = any($scope)
  and ($wh is null or f.warehouse_id = $wh);
```

`positions (leg_id, at)` already exists. The lateral lookup stays cheap because `snap_fleet` only holds trucks still out.

Change story and outlook do not have their own queries. Volume, price and cost effects are four numbers from the tile statement (cases, revenue, cost, now and previous). The outlook is a fit over the three to six complete months already in that result, done in `metrics.ts`. Next month is not drawn as an actual.

### 6.4 The drill

`GET /v1/control-room/drill` takes the page, the slice (which bar, tile or row), the same filters, a cursor and a limit of 80.

- The rows come from the fact or the document table, keyset on `(sort value, id)`, not `OFFSET`.
- The Total is a separate `sum` over the same `WHERE`, so it matches the bar even when the drawer has loaded 80 of 2,000.
- CSV uses that same `WHERE` and streams. It is not the 80 rows on screen.
- Sort default is the amount column, descending. Header sort is a new request with the same slice.

A slice key is stable and small: `{ page, metric, month?, warehouseId?, productId?, customer?, supplierId?, routeId?, band? }`. The server rebuilds the `WHERE` from it. The client does not send SQL.

### 6.5 Bounds

| Request | Statements | Reads | Target on the demo, and at three years of daily sales |
|---|---|---|---|
| Any page except the sales table | ≤ 3 | Roll and snaps only | Under 50 ms, payload under 80 KB |
| Sales table, first screen | 2 | 80 fact rows + one sum | Under 100 ms |
| Drill | 2 | 80 rows + one sum | Under 100 ms |
| Price floor | 0 on the request | The nightly snap | The page only counts statuses |

What we will not do:

- Push the new panels through the load-everything path inside `GET /v1/dashboards`. The tab stays. A new key is answered from the rollup. Keys that already exist keep their current path until they move.
- Return the facts inside the page payload.
- Compute FIFO, the regression, or the outlook by scanning history during the request.
- Cache a page across users. A 15-second in-process cache keyed by `(scope, page, filters)` is allowed after the SQL is measured, and `refresh_roll` drops the keys for that company and month.
- Add a materialized view that refreshes on a timer while the transaction-end refresh exists. One writer, one path.

### 6.6 Indexes to add

| Index | Serves |
|---|---|
| `stock_moves (entity_id, warehouse_id, at)` | Opening and closing, period movements |
| `pos (entity_id, supplier_id, date)` | PO issued by supplier — today's index is only `(entity_id)` |
| `trip_payments (entity_id, at)` | Cash paid in a period — today's index is `(entity_id, shipment_id)` |
| `shipments (entity_id, warehouse_id)` where the shipment is not yet signed for | Building `snap_fleet` without reading delivered history |
| The fact and roll primary keys in §6.2 | Every page |

`sales (entity_id, at)` and `sales (warehouse_id, at)` already exist. Once `fact_sale_line` is the read path, the page queries stop using them.

## 7. API

The screen does not change. Home already calls `GET /v1/dashboards?keys=…` with the open tab's keys. A key that needs the rollup is answered by a narrow read. A key the server does not know is still 404. A key outside the person's audience is still 403. A company outside their scope is still 403. A filter they cannot see is dropped. `pricesHidden` still drops money for a receiver.

```
GET /v1/dashboards/drill?key&slice&cursor&limit&sort
→ { columns, rows, total, nextCursor }
```

The new figures are builders beside the ones in `packages/api/src/dashboards.ts`, covered by the same fixture. The rollup SQL stays in the dashboards service. The mock runs the same builders, so the tabs render without Postgres.

## 8. Build order

Each phase is usable on its own. Later phases do not change the query shape.

| Phase | Ships | Does not ship yet |
|---|---|---|
| **A. Business tab** | Agreed layout only, then the profit panel extended: three sentences, outlook, one `Donut` for the $100 split, ranked brands. `fact_sale_line`, `fact_receipt`, `roll_month`, `refresh_roll`. | A new route, a second pie, map, ageing |
| **B. Purchasing, Warehouse, Fleet** | `fact_po_line`, `fact_plan_month`, `stock_lot`, `snap_stock`, `snap_fleet`. Plan vs actual extended. Age as a Donut variant. Days against allowance as GroupedBars. | Supplier credit, cash transfers |
| **C. Sales and Fees** | `roll_cost_month`, `snap_bill`. Payment Donut on Sales. AgeingBars stay the bill buckets. Cash statement table on Fees. | Per-client credit limits |
| **D. Warehouse filter** | The warehouse filter on Warehouse and Business shows that warehouse's tiles. They match the unfiltered tab when summed. | New maths |
| **E. Ledgers the platform does not have** | `customers` (days, limit), `supplier_credit` on Purchasing, `cash_transfers` on the Fees statement, documents under More detail on Alerts. | The assistant |
| **F. Assistant** | Glossary answers over the open tab's payload, with a link that selects that tab and applies the same filters. | A model call, a scan of facts |

Phase A is reviewed as a layout first. Once built, its profit must match the performance report for the same company, warehouse and period. The later tabs then trust the rollup.

## 9. Acceptance

| Check | Expected |
|---|---|
| Default | Combined, all suppliers and brands, last 30 days |
| Period with no rows | "No data in this period", no NaN, no thrown error |
| Warehouse rows | Sum to the combined row for sales, profit, collected and balances |
| Bridge | Sales − goods − truck − warehouse − other = the profit tile |
| Statements | Opening + in − out = closing, for stock, bills, client balances and cash |
| Supplier balance | The bar at the end date equals the last point of the month-end line |
| Click a bar | The drawer opens, and its Total equals the bar |
| Tables | Highest first, header sorts, the filter box narrows, CSV downloads the whole slice |
| Scope | Kabonge never sees a pair that is not his. Asie and Yonas see their warehouses and no prices they are not allowed. A filter cannot widen that. |
| Speed | The page request does not select from `sales`, `shipments` or `stock_moves` except for a clipped month and for the opening/closing statement |
| Home | Today, the work pages and `GET /v1/dashboards` behave as they do now |

## 10. Still to confirm

| Question | Assumed until answered |
|---|---|
| Is landed cost v2 the profit the report should show, or do they want the notebook's weighted average as a second figure? | One figure, landed cost v2 |
| Do the finer truck-cost names (entry cards, parking, O.C.C, manpower, road user fees) need their own kinds, and does offloading move to warehouse expenses? | Chart the kinds we have. Offloading on a trip stays a trip cost. |
| Per-customer credit days and limits, or the flat 14 days? | 14 days until phase E |
| Should supplier short-loads create a credit balance that the next PO consumes? | Yes, in phase E, oldest credit first, and not before |
| Who may edit route allowances and credit days? | Directors |
| Is the control room directors-only, with the operational pages shared as in §5? | Shared as in §5 |
