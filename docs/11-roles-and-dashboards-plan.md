# 11 — Plan: real users and roles, warehouse money, and feature dashboards (draft for review, 25 Oct 2026)

Sources (in `docs/inspiration/`):
- **`Users_Roles_Access_Control_updated.docx`** (the roles document): named users, their journeys, the access matrix (§7), expenses (§9) and the directors' reports (§6).
- **`Dashboards_by_Feature_Analyst_Led_Visualizations.docx`** (the dashboards document, 20 Oct): 12 analyst-led visual patterns and 56 dashboards (28 P1, 20 P2, 8 P3).
- **Your notes (25 Oct):** the six showcase visuals with sample screenshots.
  1. KPI scorecard
  2. Profit waterfall
  3. Fast/slow scatter
  4. Route × stop heatmap
  5. Delivery-loss Pareto
  6. Stock-cover bars
  7. *Item 7 did not come through.*

Progress is tracked in **[`CHECKLIST.md`](CHECKLIST.md)** (statuses + dated updates). This document explains *what* and *why*.

---

## 1. What the new documents change

| Topic | Today in the platform | What the documents ask for |
|---|---|---|
| **People** | Demo users per company: `btw-plan`, `nud-plan`, `kvd-plan`, the `*-acc` accounts, Kabonge, Tesfie, Zonas, a generic director | Named people:<br>• Directors **Daniel** and **Michael**<br>• **Kabonge**: purchase planner and static data<br>• **Testfie**: truck follow-up, truck expenses and Mombasa loading<br>• Loaders **Joel**, **Eric** (KBL Nairobi) and **Moses** (UBL Kampala)<br>• **Asie**: receiver, warehouse recorder, re-export planner<br>• **Yonas**: receiver and warehouse recorder<br>• Drivers |
| **Scope** | By company, loading point and warehouse | Also by **buyer–supplier pair**. Kabonge owns BTW–KBL, Nihna–UBL and Kivu–SBL, but **not Nihna–GBI**. Receivers see only their own deliveries. |
| **Loader screen** | The loader enters the **agreed transport price** at hand-over | Loaders see **no prices or payments**. Testfie records the agreed price **after loading**. |
| **Static data** | The Truck planner edits providers, trucks and drivers | **Kabonge** has full edit rights. **Testfie** only views. Companies, suppliers, goods and receivers can be edited, with room for 2 more companies and 3 more suppliers. |
| **Warehouse money** | Not modelled | Asie and Yonas record **warehouse expenses** (offloading, storage, salary, rent, utilities, damaged goods) and **warehouse inventory** (received, damaged, short, held, moved out). |
| **Re-export** | The director uses "Send on" to create the next leg | **Asie raises and loads re-export orders** from Rwanda to Juba, delivered to Yonas. |
| **Pricing and profit** | Landed cost = goods + trip costs; sales prices are typed per sale | Landed cost = goods + **truck** + **warehouse** expenses. **Directors set the selling price** per product, with a **target-margin helper**. A **combined performance report** works at four levels: product, warehouse, company and whole business. |
| **Sales and finance** | Accounts users exist | Sales, selling prices and trip financials are **Directors-only** until someone else is named. |
| **Audit** | Every action is logged, but there is no screen | Directors can **view and search** the audit log. |
| **Routes** | Nairobi → Gisenyi / Goma / Juba; Kampala → Gisenyi; Mombasa → Gisenyi / Juba; Tanzania → Gisenyi; Gisenyi → Juba | **Add** Uganda → Congo, Mombasa → Congo and Tanzania → Congo. |
| **Dashboards** | Overview + list tabs and ~10 reports (Plotly), CSV export | **56 dashboards** with fixed chart types. Every dashboard has:<br>• filters<br>• drill-down<br>• **PDF / Excel / CSV** export<br>• a freshness label<br>• "no data yet" instead of zero<br>• status colours that are never used alone<br>• a home screen per user |

Already matching, so no change is needed:
- Purchase orders with no approval step (`config.toml`)
- Drivers working offline
- Audit logging on every action
- Truck cost categories (`CostKind` already has Transport, Taxes & duties, Clearing & forwarding, Loading & offloading, Storage, Other)
- Multi-leg shipments
- Delivery acknowledgement with photos and signature

---

## 2. Workstreams

### A. Users, roles and access (foundation; do first)
1. **Real roster in the seed and the demo.** Daniel and Michael (director), Kabonge, Testfie, Joel, Eric, Moses, Asie, Yonas and the ETS Sabrina drivers. Retire the made-up per-company planners and accounts users. The `accounts`, `sales` and `operations` roles stay in the code, unassigned.
2. **Role definitions from §4 of the roles document.**
   - `planner` + static-data rights for **Kabonge**.
   - The current `truck_planner` role becomes **"Truck follow-up officer"** for **Testfie**:
     - follow-up: full
     - truck expenses: full
     - agreed price after loading: yes
     - fee tracking: yes
     - loading at **GBI Mombasa only**
     - static data: **view only**
   - `receiver` + **warehouse recorder** for **Asie** and **Yonas**, plus **re-export planner** for Asie.
3. **Access matrix (§7) enforced in the API, the mock and the UI**, including the "Own" scopes:
   - buyer–supplier pairs (new user scope `pairs`)
   - loading points
   - warehouses
   - Asie's re-exports
4. **Hide prices and payments by role.**
   - Loaders: none. Remove the price field from hand-over and move it to Testfie's "agreed price" step.
   - Receivers: no purchase prices or margins.
   - Drivers: nothing financial.
5. **Static-data editing** for companies, suppliers, goods and receiving companies (directors + Kabonge, as proposed), with change history.
6. **Routes**:
   - add Kampala → Goma, Mombasa → Goma and Mwanza/Tanzania → Goma
   - name them as in §3 (e.g. "Uganda → Congo")
   - assign them to users
7. **Audit log screen** for directors: search by user, feature and date, with before/after values.
8. **Users screen:** assign companies, warehouses, routes and pairs, and show last login. Most of this already exists.

### B. Warehouse and money data (needed by the directors' reports)
1. **Warehouse expenses** (Asie, Yonas): categories offloading, storage, salary, rent, utilities, damaged goods; by warehouse, company and month; receipt photo.
2. **Warehouse inventory recording:**
   - stock count and adjustments
   - "moved out" (other than sales and re-exports)
   - damaged write-off

   It builds on the stock moves we already have.
3. **Re-export orders (Asie → Yonas, Rwanda → Juba):**
   - an order raised from Asie's stock
   - loaded by Asie
   - shipped as a new shipment
   - acknowledged by Yonas
   - **Follow-up owner is to be confirmed** (open question). Dashboards show "owner not assigned" until then.
4. **Agreed transport price after loading** (Testfie) and **transport fee tracking** (paid / part paid / unpaid against a document reference, with an age flag). Partly in Trip financials today.
5. **Selling price per product**, set by the directors, with a **target-margin helper**: price = landed cost per unit ÷ (1 − margin).
6. **Landed cost v2** = goods + truck + **share of warehouse expenses**, per product and per truck.
7. **Combined performance report** and **profit margin** at product, warehouse, company and whole-business level (§6.2–6.4).
8. *(Later, scope to confirm)* Receiving-company accounting:
   - cash / credit / batch sales (sales types exist)
   - P&L
   - retained earnings and dividends

### C. Dashboards (56)
**Step 1: shared building blocks** (one set, reused everywhere)
- **Chart types to add** to the existing Plotly kit (`apps/web/src/components/charts`):

  | Chart | Used for |
  |---|---|
  | Waterfall | profit bridge |
  | Quadrant scatter | fast / slow products |
  | Pareto (bars + cumulative % + 80 % line) | delivery losses |
  | Horizontal stacked bars | landed cost composition |
  | Stage / funnel bars | PO pipeline |
  | Grouped bars + gap table | ordered vs loaded vs delivered |
  | Ageing stacked bars | fees, customer balances |
  | Bullet / stock-cover bars | days of stock vs minimum |
  | Severity × impact triage matrix | alerts |
  | Kanban status board | live fleet |
  | Box plot | hours to dispatch |

  Already in the kit: bars, lines, donut, gauge, heatmap, meter, KPI tiles.
- **Dashboard frame:**
  - metric definition, unit / currency, date range, filters limited to the user's scope
  - drill-down to records
  - **data-freshness** label and **"no data yet"** state
  - export to **PDF, Excel and CSV**. Excel and PDF are new; CSV exists today.
- **Status colours:** green / amber / red / grey, always paired with an icon or label.
- **Role home screens** (§10 of the dashboards document): each user gets only their own dashboards, on the web and in the phone app.

**Step 2: P1 (28 dashboards, first release).** The six showcase visuals you sent are marked ★.

| # | Dashboard | For | Visual | Today |
|---|---|---|---|---|
| 1 | Executive overview ★1 | Directors | KPI scorecard + exception list | partial (dashboard KPIs) |
| 2 | Combined performance | Directors | table with in-cell bars + waterfall + level switch | new |
| 3 | Profit and margin ★2 | Directors | **waterfall** (sales → goods → truck → warehouse → other → profit) + monthly stacked columns with margin line | partial |
| 4 | Landed cost per product | Directors | horizontal stacked bars | partial (no warehouse share) |
| 5 | Landed cost per truck | Directors | stacked bar per truck + table | partial |
| 6 | Selling price & target margin | Directors | calculator + gauge | new |
| 7 | PO pipeline | Kabonge, Directors | stage bars (count + value), click to list | new |
| 8 | Ordered vs loaded vs delivered | Kabonge, Directors | grouped bars + gap table | partial |
| 9 | Today's loading list | Loaders, Testfie | mobile cards, no prices | exists (phone) → remove prices |
| 10 | Loading status | Kabonge, Directors | progress bar per order + docs/photos | partial |
| 11 | Live fleet board | Testfie, Directors | Kanban by status, grouped by route | partial (Truck desk) |
| 12 | Delayed trucks | Testfie, Directors | table by days late, severity bar, owner | partial |
| 13 | Truck issues | Testfie, Directors | open-issues table + repeat issues by truck/provider | partial |
| 14 | Driver status updates | Testfie | timeline feed + last-update badges | new |
| 15 | Agreed transport price | Testfie, Directors | paired bars agreed vs actual | new |
| 16 | Transport fee payments | Testfie, Directors | table with paid/part/unpaid chips + reference search | partial |
| 17 | Unpaid & ageing fees | Directors | ageing stacked bars by provider | new |
| 18 | Expenses per truck | Testfie, Directors | stacked bar per trip, legs expandable | partial |
| 19 | Incoming deliveries | Asie, Yonas | mobile cards by expected arrival | exists (phone) |
| 20 | Received, damaged, short | Asie, Yonas, Directors | stacked bar per delivery + photos | partial |
| 21 | Stock on hand ★6 | Asie, Yonas, Directors | **stock-cover bars** (≤7, 8–14, 15–21, 22–28, 29–60, >60 days) + per-product bars | partial (heatmap today) |
| 22 | Stock in transit | Directors, Asie, Yonas | timeline of expected arrivals | partial |
| 23 | Warehouse expenses | Asie, Yonas, Directors | stacked monthly columns + category donut | new |
| 24 | Sales summary | Directors | stacked columns cash/credit/batch + top products/customers | partial |
| 25 | Customer balances | Directors | ageing stacked bars | partial |
| 26 | Users and logins | Directors | table + count tiles | partial |
| 27 | Audit log | Directors | searchable table + activity sparkline | new |
| 28 | Alerts centre | Directors, Testfie, Kabonge | prioritised list + triage matrix | partial (notifications) |

Showcase visuals that are P2 in the client's list but **pulled forward** because you sent them:
- **★3 fast / slow scatter**: sales speed × days of stock, with quadrants.
- **★4 route × stop heatmap**: average days at each border or stop, with sample size shown.
- **★5 delivery-loss Pareto**: ranked causes of shortage and damage with the cumulative line. This needs a **reason** on each shortage or damage line at acknowledgement, which is a small change to the receiver screen.

**Step 3: P2 (20) and P3 (8).** As listed in the dashboards document, built once a few weeks of real data exist:
- comparisons, trends, approvals, data completeness, offline sync monitor (P2)
- supplier, provider and warehouse comparisons, retained earnings, digest (P3)

### D. Phone app alignment
- **Kabonge and the directors:** their home dashboards in the team phone app.
- **Testfie:** follow-up, expenses and Mombasa loading.
- **Loaders:** loading list, no prices.
- **Asie and Yonas:**
  - incoming deliveries and acknowledgement
  - warehouse expenses and stock entry
  - Asie only: re-export orders
- **Drivers:** unchanged.
- One chart or list per screen, large tap targets, and a "last synced" time on offline screens.

### E. Docs, deck, tests, demo
- **Docs and deck:** update the presentation and the architecture document.
- **Tests:** QA tests for the new access matrix (one row per person × feature), warehouse expenses, re-export and landed cost v2.
- **Demo:** refresh with the named users.

---

## 3. Suggested order
1. **A (roles and access) + B1–B4 (warehouse and truck money data).** Everything else reads this data and depends on who may see it.
2. **C step 1 (chart blocks and dashboard frame) + B5–B7 (pricing, landed cost v2, combined report).**
3. **C P1 dashboards + the three pulled-forward showcase visuals**, as role home screens on the web and in the phone app (D).
4. **E (tests, docs, deck, demo)**, then review with the client before P2.

Each step is handed to at most 2–3 agents at a time, working on separate files, as before, and ends with `pnpm verify` and the QA suite passing.

---

## 4. Decisions needed (from the roles document §10, plus ours)
1. **Item 7** of your showcase list: please resend the text and screenshot.
2. Who raises **Nihna–GBI (Mombasa)** POs, and who **loads at SBL Tanzania**?
3. Who **follows up the Rwanda → Juba re-export trucks**?
4. Who approves **truck payments**, and who handles **sales and trip financials**? For now this is the directors only.
5. How are **shared truck and warehouse expenses split** across products: by quantity or by value? We propose by quantity (cases).
6. Who sets the **selling price** when the directors are away?
7. Does the **receiving-company accounting** (P&L, retained earnings, dividends) apply only to Asie and Yonas, or to every company? Who records it?
8. Do **other Asie and Yonas staff** need their own logins?
9. **Unpaid transport fee flag**: after 2 weeks or 1 month? We propose amber at 2 weeks and red at 1 month.
10. **Spelling** of the names:
    - Testfie (we had "Tesfie") and Yonas (we had "Zonas")
    - Daniel and Michael: do they have the same full access?
11. **Loading queue ordering** isn't mentioned in the roles document. Should it stay with Testfie, move to Kabonge, or go to both?
12. **Which reasons** should appear for shortages and damages? This is needed for the Pareto chart. Proposed list:
    - breakage in transit
    - poor stacking
    - theft / pilferage
    - leakage
    - border inspection
    - short-loaded at supplier
    - other
