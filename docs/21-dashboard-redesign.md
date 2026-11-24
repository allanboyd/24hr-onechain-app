# Dashboard redesign (Home Today and tabs)

Status: In progress. Home Today matches the mockup; feature tabs use the same language, filter modal, chart|table toggle, and denser default cards.

## Purpose

Calmer morning desk for directors on **My dashboards**, and feature tabs that capture the same kind of glanceable information (KPIs or lists to act on, paired charts, clear decisions).

## Mockup

Interactive canvas (illustrative figures): Cursor project canvases → `home-today-mockup.canvas.tsx`.

## Home Today composition

| Order | Block | Notes |
|---|---|---|
| 1 | Toolbar | Filter icon → modal (period, warehouse, currency); optional period chip |
| 2 | KPI strip | Sales hero + Profit, Cash to collect, Trucks, Stock at risk, Margin |
| 3 | Decisions \| Sales and profit \| Stock cover | Narrow decisions beside two graphs |
| 4 | Money owed | Ageing bands + top balances side by side; table via icon toggle |

**Off Today:** top products and sales distribution. Those sit on Sales.

## Feature tabs

One report per tab. There is no Advanced / normal switch. Order and the sections that repeat a panel are in `apps/web/src/screens/dash/room.ts`.

| Tab | Default capture |
|---|---|
| Business | Executive overview (KPIs + exceptions side panel), profit bridge + $100 donut, monthly sales/profit, selling prices |
| Purchasing | Order this week, PO pipeline, open orders, plan vs actual |
| Loading | Loading list, loading status, dispatched today |
| Fleet | Live board, delayed trucks, issues (paired charts), driver updates |
| Fees | Agreed vs actual, trip expenses, fee payments, unpaid ageing + top balances |
| Deliveries | Incoming, received/damaged/short, delivery losses |
| Warehouse | Warehouse today, stock cover, in transit, expenses (month \| share), movements |
| Sales | Sales summary, top products \| customers, customer balances (ageing \| top), cash vs credit |
| Admin | Alerts, data completeness |

Rules shared with Today: noun titles (`r.title`), one decision line, filter icon → modal (no duplicate filter bar), chart|table icon pair, no em dashes, pair charts instead of one stretched series.

## Language

| Avoid | Prefer |
|---|---|
| Needs your decision today | Decisions |
| Which stock needs action today? | Stock cover |
| Who owes us? | Money owed |
| Long question H3s on feature panels | Catalogue title (`r.title`) |

## Related

- [15-dashboards.md](15-dashboards.md) — catalogue and Today data contract
- [13-dashboard-kit.md](13-dashboard-kit.md) — panel kit and export
- [20-control-room.md](20-control-room.md) — feature-tab room pages
- `.cursor/rules/dashboards-home.mdc` — agent rule
