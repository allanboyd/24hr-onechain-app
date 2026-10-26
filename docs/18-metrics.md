# 18 — One metric registry: the same figure everywhere (26 Oct 2026)

Phase 0 of the page design review ([17](17-page-design-review.md) §5, findings F3 and F4). Tracker: [CHECKLIST](CHECKLIST.md) F-0a, F-0b.

## 1. Why
The same figure was computed separately on each page, so the numbers disagreed:
- **Trucks on the road:** 8 on Shipments, but 6 on the Truck desk and on Home.
- **Delivered:** 132 on Shipments, but "130 of 134" on Purchase orders.

Each surface had its own definition. Now every figure that appears on more than one surface has **one definition and one function**, in `packages/api/src/metrics.ts`. Every surface passes in the data it has already loaded for the person's scope, so the same scope and period always give the same number.

| Surface | Where it calls the registry |
|---|---|
| Home dashboards, including the directors' Today view | `packages/api/src/dashboards.ts` (`fig`, `fleetNow` → `MX.*`) |
| Web page tiles and chips (Shipments, Purchase orders, Loading, Inventory, Sales, Trip financials, Transport fees, Truck desk) | `apps/web/src/lib/tiles.ts`, plus `deskKpis` in `packages/api/src/trucks.ts` |
| Team app homes (phone) | `apps/field/src/team/figures.ts`, used by `glance.ts` and `insights.ts` |
| Summary call (`analytics.summary`), on the server and in the mock | `apps/api/src/domain/stock.service.ts`, `packages/api/src/mock-client.ts` |
| Reports and exports (stock report, sales report, deliveries / on time) | `packages/api/src/reports.ts` |

Each registry entry (`METRICS`) has:
- a key
- a label
- a definition in plain English (shown in the ⓘ popovers and dashboard definitions)
- a unit
- whether it uses a period
- the `compute(source)` function

`computeAll(source)` returns every figure, with `null` where the data is missing. A missing figure is "No data yet", never a zero.

## 2. Definitions

### Fleet (as of now)
| Key | Figure | Definition |
|---|---|---|
| `trucks-on-road` | Trucks on the road | The truck has **left the loading point** and has **not yet arrived** at the destination warehouse. Its current leg (the first leg not yet signed for) is Dispatched, In transit, At border or Delayed. **Not counted:** trucks loaded but still at the loading point, trucks that arrived and wait to be signed for, delivered trips. Counted per shipment (one truck per trip). |
| `trucks-delayed` | Delayed | A truck on the road that is **6 h or more behind plan**, is marked Delayed, or has an **open issue**. |
| `trucks-at-border` | At a border | A truck on the road stopped at a border, and not delayed. Delayed trucks count as delayed only, so in transit + at a border + delayed = on the road. |
| `trucks-in-transit` | In transit | A truck on the road that is neither delayed nor at a border. |
| `trucks-no-checkin` | No check-in | A truck on the road whose next checkpoint check-in is **more than 3 h overdue**. |
| `arriving-today` | Arriving today | A truck on the road whose latest expected arrival falls today (UTC day). |

The Truck desk board uses the same state rule (`metrics.roadState`), so its columns add up to the same numbers.

### Deliveries (for a period)
| Key | Figure | Definition |
|---|---|---|
| `delivered` | Delivered | Truck trips **signed for at their destination**, counted on the day they **arrived there**. Every trip counts: first trips from the supplier, onward trips between our warehouses, and re-exports. |
| `on-time` | On time | The share of the period's deliveries that arrived **at most 6 h after the planned arrival**. |

### Orders (as of now)
| Key | Figure | Definition |
|---|---|---|
| `orders-to-load` | Orders awaiting loading | Purchase orders with **at least one truck still to load**. Only orders that are the latest revision, not deleted and not waiting for approval. |
| `trucks-to-load` | Trucks to load | The truck lines of those orders that are not loaded yet. |

### Stock (as of now)
| Key | Figure | Definition |
|---|---|---|
| `stock-value` | Stock value | Cases on hand × the **landed cost per case** of each product, in USD. Landed cost per case = goods + all trip costs ÷ cases loaded, over the product's deliveries (`landed.ts`). Before a product's first delivery: list price × 1.21. The stock lists carry this cost on every row (server and mock), so the Inventory page, the stock report, the summary, Home and the phone all show the same value. |
| `cases-on-hand` | Cases on hand | Received + transfers in − transfers out − damaged ± counts − sold, per company × warehouse × product. A negative balance counts as zero. |
| `stock-in-transit` | In transit | Cases loaded on trucks that are not signed for yet. |
| `stock-needs-attention` | Needs attention | Stock lines that are out of stock, have under 14 days of cover, have over 60 days of cover, or have had no sale in 30 days. Cover = cases on hand ÷ cases sold per day over the last 30 days (per company × warehouse × product). The Inventory page levels use the same rule (`metrics.stockRisk`). |

### Sales (USD; sales between our own companies are removed in the Group view)
| Key | Figure | Definition |
|---|---|---|
| `sales` | Sales | Cases × price of every sale dated in the period, at the approved month rate. |
| `cases-sold` | Cases sold | Cases on every sale dated in the period. |
| `owed-by-customers` | Owed by customers | Unpaid and part-paid sales **now**: sale value − amount paid. |
| `overdue-by-customers` | Overdue | The part of what customers owe on sales older than the **14-day payment terms** (to confirm). |

### Transport fees (USD)
| Key | Figure | Definition |
|---|---|---|
| `transport-owed` | Transport owed (open balance) | Agreed transport price − approved payments against it, over trips not fully paid. Payments waiting for a director are not deducted yet. |
| `fees-over-amber` | Unpaid over 14 days | Trips with an open balance, loaded at least `[fees] amber_days` (14) ago. This includes the ones over 30 days. |
| `fees-over-red` | Unpaid over 30 days | Trips with an open balance, loaded at least `[fees] red_days` (30) ago. |
| `price-not-recorded` | Agreed price not recorded | Loaded trips without an agreed transport price yet, re-exports and onward trips included. |

### Profit (landed cost v2, for a period)
| Key | Figure | Definition |
|---|---|---|
| `profit` | Profit | Sales − cost of units sold at landed cost v2 − warehouse costs of months with nothing received ("other"). |
| `margin` | Margin | Profit ÷ sales, with the same profit as above. |
| `landed-per-case` | Landed cost per case | Goods + truck costs + warehouse share of the goods received in the period ÷ cases received good. |

## 3. What disagreed before, and why
| Figure | Before | Cause | Now |
|---|---|---|---|
| Trucks on the road | Shipments 8, Truck desk / Home 6 | Shipments counted every trip not yet delivered, including trucks still at the loading point (Loaded) and trucks that had arrived but were not signed for. | 6 everywhere |
| Delayed | Shipments used the shipment status. The Truck desk also counted open issues. The phone used the summary (shipment status). | Two rules for "delayed". | One rule: behind plan, marked delayed, or an open issue |
| At a border | Shipments counted a leg at a border even when it was delayed. The desk counted it as delayed. | Overlapping states. | Exclusive states |
| Delivered | Shipments 132, Purchase orders "130 of 134" | Purchase orders counted only first trips of its orders. It left out re-exports (ASIE-RX-0001/0002) and onward trips. | 132 everywhere. The Purchase orders tile shows "Delivered" with the same count. |
| On time | Shipments: legs within **1 h** of plan. Today: legs arrived in 7 days within 6 h. Reports: dated by acknowledgement. | Three windows and three rules. | Deliveries dated by arrival, within 6 h |
| Stock value | Inventory and summary used a placeholder (list price × 1.21). Reports used landed cost v1. Home exec used performance stock value. | Three different landed costs. | One landed cost per product on every stock row |
| Owed by customers | The Sales page summed the list (latest sales only, mixed currencies). The summary used mixed currencies. The report used a 0.5 cut-off. | Different sources and currencies. | All sales in USD, one rule |
| Transport owed | Trip financials summed negative balances and payments on every cost line. The Truck desk counted all payments. The fee page counted transport payments only. | Different payment sets. | Approved payments against the transport line, open trips only |
| Price not recorded | The Truck desk left out re-exports and onward trips. | Different sets of trips. | Every loaded trip |
| Profit and margin | The phone used profit before other costs. The margin was before other costs on every surface. | Two profits. | Profit after other costs, and margin = that profit ÷ sales |
| Orders awaiting loading | Home exec counted order "facts" not yet delivered. The phone counted pending loadings. | Different stage logic. | Live orders with a truck still to load |

## 4. Amount sanity rules (F-0a)
**Root cause of the USD 3,050,000 price:** the demo seed (`packages/api/src/mock/db.ts`, NUD-PO-2026-0009 truck 1 on t5 / Company X) called `completeLoading(…, 3_050_000)` **before** it set `ld.transportCurrency = 'UGX'`. As a result:
- The Transport cost line was written as **USD 3,050,000** (fx 1).
- The loading itself said UGX.
- `pnpm db:seed` uses the same snapshot, so the server had it too.

**Fixes:**
- **Seed:** the seed now sets the currency first.
- **Existing databases:** migration `0012_transport_cost_currency.sql` repairs any "Agreed at loading" cost whose currency disagrees with its loading. It uses the month-average rate, so the cost becomes UGX 3,050,000 ≈ USD 820.
- **Expense mix:** the Trip financials expense mix also summed amounts in mixed currencies. It now sums in USD.

`packages/api/src/amounts.ts` holds the rules, used by the server, the mock and the screens.

**Usual range per entry, in USD.** Other currencies are converted at the approved month rate.

| Entry | Usual range (USD) |
|---|---|
| Agreed transport price per truck | 100–20,000 |
| Trip expense | 1–15,000 |
| Warehouse expense | 1–25,000 |
| Transport payment | 1–20,000 |

**What happens to an amount:**
- **Outside the usual range:** the server answers 422 `unusual-amount` with a message such as "This is unusually high for an agreed transport price per truck: UGX 200,000,000 ≈ USD 53,980 (usual USD 100–20,000). Are you sure?". The screens ask that question (`withUnusualConfirm`) and send the save again with `confirmUnusual: true`. The audit row then says "unusual amount confirmed (≈ USD …)".
- **Impossible** (negative or zero, more than 50 × the upper bound, a missing or unknown currency, no exchange rate): the server always refuses with 422 `impossible-amount`.
- **Looks like a local currency:** a USD amount of at least 5 × the upper bound (100,000 for transport) also gets a "looks like a local currency entered as USD" hint. It names the currencies in which the number would be plausible, for example "UGX 3,050,000 ≈ USD 822".
- **Currency is always explicit:** the agreed price, trip costs, warehouse expenses, and loading with a price no longer default to USD.

The ranges are our proposal, to confirm with the client.

## 5. Tests
- `packages/api/test/metrics.test.ts` (in `pnpm test`), **85 checks**. It computes every shared figure through each surface's own code path, for five scopes: Group, BTW, Kabonge, Testfie and Asie. The code paths:
  - the registry
  - the Shipments and Purchase orders tiles
  - the Truck desk and the phone desk
  - the summary
  - the phone director figures
  - Home exec and Today
  - the fleet board
  - the Inventory tiles and the stock report
  - the Sales tiles and the customer balances
  - the Transport fees, Trip financials and Truck desk money tiles

  It asserts the values are equal. It also checks every registry entry has a definition with no spec codes, and that missing data gives `null`.
- `packages/api/test/amounts.test.ts`, **32 checks**:
  - the rules, the messages and the screen helper
  - every seeded cost and expense passes (no impossible amount; every agreed price ≤ USD 20,000; the 3,050,000 price is UGX)
  - the mock refuses or accepts amounts as the server does, and the audit note is written
- QA `money` suite: a new section with **17 checks** over HTTP and the database:
  - the seed is fixed
  - migration 0012 repairs a broken row
  - the 422 codes are returned
  - confirmed amounts are audited
  - currency is required
