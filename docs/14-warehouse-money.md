# 14 — Warehouse and money data (workstream B of plan 11)

Built 25 Oct 2026 from the client's roles document (`docs/inspiration/Users_Roles_Access_Control_updated.docx`, §6.2–6.4 reports, §8 truck follow-up, §9 expenses and warehouse inventory). Plan: [11](11-roles-and-dashboards-plan.md) §B · tracker: [CHECKLIST](CHECKLIST.md) B-01…B-08 · roles: [12](12-roles-access.md) · charts: [13](13-dashboard-kit.md).

Every decision marked **to confirm** is our proposal while the client's answers are pending.

## 1. What was built

| Item | Who | Web | Phone |
|---|---|---|---|
| **B-01 Warehouse expenses** — Offloading, Storage, Salary, Rent, Utilities, Damaged goods, Other; warehouse, date, amount, currency (USD at the approved month rate, like trip costs), reference, note, receipt photo | Asie (Gisenyi, Goma), Yonas (Juba): **Own**; directors: **Full**; everyone else: none | `#/warehouse-expenses` — filters, monthly stacked columns, largest categories, list with edit / remove, CSV / Excel / PDF | Receiver home → **Expense** (lazy sheet: category chips, amount, receipt photo, this month's totals) |
| **B-02 Warehouse inventory** — per company × product: received, transfers in, damaged, **short**, **moved out**, sent on / re-exported, sold, count differences, **held**, last count; record a **stock count** (posts the difference), **damaged write-off**, **moved out** (not a sale / re-export, note required) or **found** | Receivers their own warehouses, **quantities only**; directors all | `#/warehouse-stock` | Receiver home → **Stock count** |
| **B-03 Re-export orders** — Asie raises from her Gisenyi stock (company, products, cases), loads it herself (truck from the list or a market truck, cases actually loaded, no prices) → a **new shipment** on *Rwanda → Juba* (`r-kgl-juba`) whose ref is the order ref **`ASIE-RX-2026-0001`**; Gisenyi stock goes out at loading (transfer out); Asie dispatches it from the usual "Load & hand over" card; **Yonas acknowledges** it into Juba stock (transfer in, with reasons); cancel while open | Asie raises / loads; Yonas sees incoming; Testfie follows up (**owner to confirm, Q3**); directors all | `#/re-exports` | Receiver home → **Re-export** (Asie) |
| **B-04 Agreed price + transport-fee tracking** — per trip: agreed transport price (recorded after loading, `POST /shipments/:id/agreed-price`) vs payments against references → **Not recorded / Unpaid / Part paid / Paid**, age since loading, **amber ≥ 14 days, red ≥ 30 days** while a balance is open; expenses per trip **and leg** | Testfie: agreed price, expenses, fee status (no goods value); directors: also record / approve payments | `#/transport-fees` — KPIs, ageing bars per provider, search by reference, actions | Team app **Money** (Testfie, directors): age chips + "Unpaid 2 weeks+" filter |
| **B-05 Selling prices** — per product per warehouse, with a company-wide default, from an effective date (history kept); target-margin helper; **new sales default their line price** from it (web Sales, team app quick sale) | Directors only (**Q6** who sets them otherwise) | `#/selling-prices` | — |
| **B-06 Landed cost v2** — goods + truck + warehouse-expense share, per product (× warehouse × company) and per truck | Directors | in `#/performance` | — |
| **B-07 Combined performance + margins** at product, warehouse, company (BTW, Nihna, Kivu), receiving company (Asie, Yonas) and whole business; fast / slow products; profit bridge; landed cost per truck | Directors only | `#/performance` — level switcher, KPI tiles, Waterfall, StackedBarH, table with in-cell bars, target-margin helper, exports | — |
| **B-08 Shortage / damage reason** on every acknowledgement line with a loss: Breakage in transit, Poor stacking, Theft/pilferage, Leakage, Border inspection, Short-loaded at supplier, Other (**to confirm, Q12**) | Receivers record; shown on the shipment | reason shown on the shipment's acknowledgement | Receive sheet: **Why?** (required with "What happened?") |

Directors' web nav: **Finance → Performance, Selling prices, Trip financials, Transport fees**; **Stock & sales → Warehouse stock, Warehouse expenses**; **Logistics → Re-export orders**. The six screens share one lazy chunk.

## 2. Access (adds to doc 12 §2)

| Feature key | Directors | Kabonge | Testfie | Loaders | Asie | Yonas | Drivers |
|---|---|---|---|---|---|---|---|
| `warehouse-expenses` | F | — | — | — | O (Gisenyi, Goma) | O (Juba) | — |
| `warehouse-stock` (no values) | F | — | — | — | O | O | — |
| `re-export` | V (all) | — | V (follow-up) | — | O (raise / load from her warehouse) | V (to Juba) | — |
| `transport-fees` | F (+ payments) | — | F (no payments, no goods value) | — | — | — | — |
| `selling-prices`, `performance` | F | — | — | — | — | — | — |

Rules live in `packages/api/src/money.ts` (`seesWarehouse`, `canRecordWarehouse`, `canEditExpense` — directors or the person who recorded it, `canRaiseReexport`, `seesReexport`, `canSetSellingPrice`, `seesTransportFees`) and are used by the server, the mock and the screens. `re-export` was widened to `receiver` and `truck_planner` for viewing.

## 3. API

| Method | Path | Notes |
|---|---|---|
| GET / POST | `/v1/warehouse/expenses` | `?warehouseId&from&to&category`; POST body `WarehouseExpenseInput` (+ `receiptFileId` / `receiptName` / `receiptUrl` from `POST /files`) |
| PATCH / DELETE | `/v1/warehouse/expenses/:id` | directors or the recorder |
| GET | `/v1/warehouse/stock` | `?warehouseId&from&to` → `WarehouseStockRow[]` (quantities only) |
| GET / POST | `/v1/warehouse/stock-adjustments` | POST `{ warehouseId, productId, entityId, kind: count \| damaged \| moved-out \| found, counted \| qty, note }` (idempotency key supported) |
| GET / POST | `/v1/reexports`, `/v1/reexports/:id` | create `{ fromWarehouseId, entityId, lines, note }` |
| POST | `/v1/reexports/:id/load` | `{ truckId, driverId }` or `{ market: { reg, company, driverName, driverPhone } }`, `loadedQty` |
| POST | `/v1/reexports/:id/cancel` | open orders only |
| GET / POST | `/v1/selling-prices` | `{ entityId, productId, warehouseId \| null, price, from, note }` |
| GET | `/v1/finance/fees` | `TransportFeeRow[]` |
| GET | `/v1/reports/performance` | `?level=product\|warehouse\|company\|receiving\|business&from&to&warehouseId&productId&targetMargin` |

Client: `warehouse.*`, `reexports.*`, `pricing.*`, `finance.fees()`, `reports.performance()` (mock: lazy chunk `packages/api/src/mock/money.ts`). Acknowledgement lines accept `reason` (422 if not in the list).

## 4. Formulas — landed cost v2 and profit (`packages/api/src/performance.ts`)

- **Quantity received** = received − damaged (short cases are never received).
- **Goods cost** = cases **loaded** × PO price. Goods sent on or re-exported carry the **landed cost per case of the warehouse they left** (goods + truck + that warehouse's share).
- **Truck cost** = every trip cost of the shipment (agreed transport, taxes & duties, clearing & forwarding, loading & offloading, storage, other — all legs), split over its products **by cases loaded** (`[costs] allocation = "quantity"`) or **by goods value** (`"value"`).
- **Warehouse share** = (that warehouse's expenses of the month ÷ good cases it received that month) × the line's good cases (or by goods + truck value with `"value"`). Months with expenses and nothing received stay **unallocated** and appear as **Other** in the profit bridge.
- **Landed cost per case** = (goods + truck + warehouse share) ÷ quantity received.
- **Cost of units sold** = cases sold × landed cost per case (this period's receipts of that product at that warehouse / company → else all its receipts there → else the product anywhere → else list price × 1.21, marked *estimated*).
- **Profit** = revenue − cost of units sold · **Margin %** = profit ÷ revenue · **Price for a target margin** = landed cost per case ÷ (1 − target).
- Company and business totals count goods moved between **our own** warehouses once (their extra truck and warehouse costs stay).

**Worked example** (unit test `packages/api/test/money.test.ts`):

| | A | B | Truck |
|---|---|---|---|
| Loaded × PO price | 1,000 × $10 = $10,000 | 500 × $20 = $10,000 | 1,500 cases |
| Received / damaged / short | 990 / 5 / 10 → **985 good** | 500 / 0 / 0 → **500 good** | 1,485 good |
| Truck costs $2,700 (transport 1,500 + duties 900 + clearing 300) by cases | $1,800 | $900 | |
| Warehouse expenses of the month $1,485 ÷ 1,485 good cases = $1 | $985 | $500 | |
| **Landed cost** | **$12,785 → $12.98 / case** | **$11,400 → $22.80 / case** | $24,185 → $16.29 / case |
| By value instead | truck $1,350, warehouse $742.50 → $12.28 / case | | |

A sells 600 cases at $15: revenue $9,000, cost of units sold 600 × 12.9797 = **$7,787.82**, profit **$1,212.18**, margin **13.47 %**. Target margin 20 % → price needed 12.98 ÷ 0.8 = **$16.22**. September expenses of $300 with nothing received → Other −$300 → profit after other costs $912.18.

**Transport fees**: status from the Transport cost lines vs payments with status Paid (pending approvals shown apart); age = days since loading (loading record; re-exports: the order's loading); flag amber at `amber_days`, red at `red_days`, only while unpaid / part paid.

## 5. Config keys (`apps/api/config.toml`, sent to the apps in `GET /ref` → `config`)

```toml
[fees]
amber_days = 14     # unpaid / part-paid transport fee turns amber (to confirm, Q9)
red_days = 30       # … and red (must be above amber_days)

[costs]
allocation = "quantity"   # "quantity" (cases) or "value" — truck and warehouse cost split (to confirm, Q5)
```
`AppConfig.fees`, `AppConfig.costs` (defaults in `rules.defaultConfig`; the mock reads overrides from localStorage `btw-config` / `demo.setConfig`).

## 6. Data and migration

`apps/api/drizzle/0010_warehouse_money.sql`: tables `warehouse_expenses`, `selling_prices`, `reexport_orders`; `stock_moves.reason`, `.note`, `.by_user_id`. Acknowledgement reasons live in `acks.lines` (jsonb). Re-export shipments use `po_id` = the order id and `loading_point_id` = the warehouse they left.

**Seed** (`packages/api/src/mock/money-history.ts`, same data in the mock and `pnpm db:seed`): three full months + this month of warehouse expenses at Gisenyi (paid in RWF), Goma and Juba (rent, salary, utilities, storage, other, offloading per delivery, damaged goods); reasons on every historical shortage / damage (weighted so a Pareto has a clear head; the two planted "unexplained discrepancy" capture gaps stay unexplained); company-wide selling prices from the prices sales actually used (changed ~5 weeks ago) + a Juba price for Tusker cans; month-end counts, a write-off, a moved-out and a found stock entry; re-exports `ASIE-RX-2026-0001/0002` delivered, `-0003` on the road (Nihna Brand C), `-0004` raised and waiting to load (Kivu). Re-exports travel with a Gisenyi transporter added for them (Rubavu Haulage, RAD 812K — demo data). In the mock this history is added lazily at `ready()` so it stays out of the apps' entry chunks.

## 7. Tests

- `pnpm test` → `packages/api/test/money.test.ts` (new, 89 checks): the worked example (quantity and value), fee status / flags, selling-price effective dates, warehouse stock incl. short and moved out, adjustment rules, Pareto input; the mock end to end — expenses access, counts, re-export Asie → Yonas with stock movements and ack reasons, fees and payments, selling prices, performance at every level, access denials.
- `pnpm --filter @btw/server test:qa --only money` (new suite, 101 checks, isolated `btw_qa_money` on :3286): the same over HTTP + DB (stored reasons, stock moves, audit rows, config in `/ref`). Full QA: **990 / 990**.

## 8. To confirm (client)

| # | Decision we took | Question |
|---|---|---|
| Q3 | Re-export trucks followed up by Testfie (`followUpById`) | Who follows up Rwanda → Juba? |
| Q5 | Truck and warehouse costs split **by cases** (`allocation = "quantity"`) | By quantity or by value? |
| Q6 | Selling prices: directors only | Who sets them when the directors are away? |
| Q9 | Amber at 14 days, red at 30 days after loading | 2 weeks or 1 month? |
| Q12 | Reason list above | Which reasons? |
| — | Expenses belong to the warehouse and its receiving company; spread over every company's goods received there that month | OK? |
| — | Months with expenses but no goods received are not in any landed cost (shown as "Other") | OK, or carry them to the next month? |
| — | Damaged goods also as an expense category (value written off) while damaged cases already raise the cost per case | Keep both? |
| — | Selling price per product per warehouse with a company-wide default (USD) | Per company, per warehouse, local currency? |
| — | Re-export orders belong to one company's stock (choose BTW / Nihna / Kivu) | Mixed-company orders needed? |
| B-09 | Receiving-company accounting (P&L, retained earnings, dividends) not built | Scope (Q7) |
