# 19 — Report review for the demo (30 Oct 2026)

Done with Playwright on the live working copy: web :5173, API :3101, database `btw`, Cursor's uncommitted changes included. Every Home tab was captured as Daniel, Kabonge, Testfie and Asie. Screenshots are in `scratchpad/rep/`.

## 1. Verdict
**The story structure is good.** Cursor turned every panel into a question with a "Decision" line, for example:
- "Where does the business stand today?"
- "How do sales become profit?"
- "Which trucks wait for my signature?"

Each person's tabs read in a sensible order: summary → what needs action → why.

**Three things will hurt the demo:**

| # | Problem | What the audience sees | Cause |
|---|---|---|---|
| D1 | **Old data.** The last sale in the demo database is **25 Oct**. | "Sales today 0", "No data yet" on Profit, Top products, Combined performance and Landed cost; the sales line falls to zero after 25 Oct; "Updated 4 d ago" everywhere. | The database was seeded on 26 Oct and the seed stops the day before seeding. |
| D2 | **Every tab opens on "Today".** | Even after a fresh seed, most panels are empty or show a single day. | `apps/web/src/screens/dash/period.ts`: `DEFAULT_PERIOD = 'today'` |
| D3 | **Old report sections pile up under the question panels.** | Very long tabs that repeat the same charts. | Retired Reports were appended as "Stock positions", "Stock report", "Sales report" and similar sections (`Analysis.svelte`). |

Tab lengths behind D3, as Daniel: Warehouse ~8,700 px, Purchasing ~6,600 px, Fleet ~5,500 px, Sales ~4,800 px.

Duplicates found under D3:
- **Warehouse:** "Stock ageing" vs "Stock age"; "Stock level" donut vs "Where stock stands" donut; "Days of cover" vs the stock-cover bands; "Sales velocity" vs "Fast & slow".
- **Purchasing:** "Planned vs actual" vs "Is purchasing following the period plan?".

**Smaller issues:**
- SSD 410K says "Expected 18 Aug", an old seed date.
- "What came in and went out?" is empty on Today.
- Sales distribution shows 0 for every company on Today.
- On Kabonge's Fleet tab only the old report section shows; there is no question panel.

## 2. Before the demo (today, each step small)
1. **Default period → "Last 30 days"** in `period.ts` (`DEFAULT_PERIOD = '30'`). The Today view's KPI cards keep "today vs …" only where the seed has same-day data. Otherwise they label themselves "Last 7 days".
2. **Fresh data on demo morning:** run `pnpm work --reset`, or `pnpm db:seed` against the demo database, about 1 minute before you present. Check that "Updated …" reads minutes, not days.
3. **Fold the old report sections.** `Analysis.svelte` sections go behind one closed **"More detail ▾"** expander per tab. Remove these exact duplicates:
   - Stock age
   - Where stock stands
   - Days of cover (the bands already answer it)
   - Planned vs actual chart (the question panel answers it)
   - Sales velocity heatmap (keep the table under More detail)
4. **Kabonge's Fleet tab:** show the question panels he may see ("Where is every truck?"), or hide the tab for him.
5. **Fix the seed date** of SSD 410K's expected arrival so it stays relative to the seed date.
6. **Quick re-check:** run the Playwright pass again (`scratchpad/rep/run.mjs <Name>`) and `pnpm verify`. Commit Cursor's work plus these fixes on `design-v2` before you present.

## 3. Demo story (suggested order, about 12 min)
1. **Daniel, Home → My dashboards (Today):**
   - "Needs your decision today" (payments to approve, delayed trucks, fees > 30 d)
   - "Who owes us?"
2. **Business:** where the business stands → **profit bridge (waterfall)** → landed cost per case → selling prices vs target margin.
3. **Purchasing as Kabonge:**
   - "What should we order this week?" → create a PO
   - Show the Versions panel (rev001) → PO pipeline
4. **Fleet / Fees as Testfie:**
   - Where is every truck (board + map with truck pins) → late trucks and owner
   - Agreed vs actual → unpaid fees ageing
5. **Phone:**
   - Joel loads at KBL (no prices)
   - The driver checks in
   - Asie signs with a damage reason → stock updates
   - Asie raises a re-export to Yonas
6. **Warehouse / Deliveries:**
   - Stock-cover bands
   - **Pareto of delivery losses**
   - Fast & slow scatter
   - Warehouse expenses
7. **Sales:** cash / credit / batch and customer ageing → **Companies side by side** (Group view) → Audit log.

## 4. Coverage against the client documents
| Source | What it asks for | Status |
|---|---|---|
| Roles document §6.1 | A report for every feature (POs, loading, fleet, truck expenses, acknowledgement, warehouse inventory, warehouse expenses, sales, trip financials) | ✅ Each has a Home tab or section |
| Roles document §6.2–6.4 | Combined performance at 4 levels, landed cost columns, profit margin, target-margin helper | ✅ Performance page + Business tab (empty only because of D1 / D2) |
| Dashboards document, 28 P1 | Executive overview … alerts centre | ✅ All present |
| Dashboards document, 12 analyst visuals | KPI scorecard, waterfall, stacked landed cost, quadrant scatter, route × stop heatmap, stage bars, grouped bars, Pareto, stock-cover bars, ranked expenses, ageing bars, triage matrix | ✅ All present |
| Your showcase list 1–6 | KPI scorecard, waterfall, scatter, heatmap, Pareto, stock-cover bars | ✅ |
| Your showcase item 7 | — | ❓ The text never arrived |
| Dashboards document P2 / P3 | Comparisons, data completeness, offline sync monitor, digest, retained earnings | 🟡 Data completeness and users & logins exist; the rest is after the demo |
| Roles document §9 accounting | P&L per receiving company, retained earnings, dividends | ❓ Waiting for the client (B-09); say so in the demo |

## 5. After the demo
- **Real figures:** a seed that also produces today's activity (morning sales, today's check-ins), so "Today" is never empty in a demo.
- **Tab length:** a "Story mode" with at most 6 panels per tab. Everything else stays under More detail, and each panel gets a one-line takeaway written from the data ("Profit fell 5% because truck cost per case rose").
- **Remaining work:** P2 / P3 dashboards and B-09 accounting once the client answers. Then choose v1 or v2 and merge.
