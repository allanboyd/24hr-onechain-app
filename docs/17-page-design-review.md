# 17 — Page design review: which pages start with an overview (26 Oct 2026, for review)

Senior-engineer / system-design review of every web page, done by opening each page as Daniel (director, Group view) on the
running build. Screenshots: `scratchpad/audit-pages/` (one per page).

## 1. Short answer
**No — not every page should start with an overview.** A page should open on what its main user came to do:
- **Work pages** (record, follow up, approve) open on the **work list**, with a thin strip of 3–4 counts on top that also act as filters.
- **Analysis pages** (understand, compare, decide prices) open on **charts**.
- **Monitoring pages** (where is everything now) open on the **live view** (board or map).

Analysis already has a home: the **Home tabs** (My dashboards, Business, Purchasing, Fleet, …). Today the same charts appear in three places:
- the Home tabs
- an "Overview" tab on 8 pages
- the Reports page

The plan is to keep analysis in **one place** and make the other pages faster to work in.

## 2. What we found
| # | Finding | Evidence | Why it matters |
|---|---|---|---|
| F1 | **8 work pages open on charts, not the list:**<br>• Purchase orders<br>• Loading<br>• Shipments<br>• Inventory<br>• Sales<br>• Sales velocity<br>• Trip financials<br>• Period plans | The Overview tab is the default (`lib/tab.ts`) | People who come to act need one extra click every time. On Loading, Testfie / Kabonge land on queue charts instead of the queue. |
| F2 | **Three copies of the same analysis**: Home tabs, page Overview tabs, Reports page | e.g. "trucks by company" appears on Shipments, the Home Fleet tab and Reports → Logistics | Three places to maintain, and the numbers drift (F3). The user has to guess which one is right. |
| F3 | **Numbers disagree between pages** | Trucks on the road: **8** (Shipments) vs **6** (Truck desk, Home).<br>Delivered: **132** vs **130 of 134** (POs). | Destroys trust in every figure. Each page computes its own definition. |
| F4 | **Data bug**: one trip's agreed price is **USD 3,050,000** (almost certainly 3.05 M UGX entered as USD) | Transport fees "Open balance USD 3,063,020". Trip financials "Owed USD 3.1M". Expense mix "USD 33.8M". | The directors' money pages are wrong. There is no sanity check on amounts or currency. |
| F5 | **Overlapping pages:**<br>• Inventory vs Warehouse stock<br>• Trip financials vs Transport fees<br>• Truck desk vs Shipments vs Loading vs Tracking<br>• Reports vs Home tabs<br>• Sales velocity vs Fast & slow on Home | 22 pages in the sidebar | It's hard to know where to go. The same task can be done in two places. |
| F6 | **Group view clutter**: each page repeats "Choose a company to record …: BTW / NUD / Kivu" rows, two of them on Truck desk | POs, Sales, Truck desk, Trip financials | Noise at the top of every page. |
| F7 | **Internal spec codes in the UI**: "(LD-01, §17.4)", "(AK-05)", "(FN-03)", "(docs/12)", "(Q-P7)", "(NT-01)" | Loading, Inventory, Trip financials, Sales velocity, Notifications | The client sees developer references. |
| F8 | **Very long pages** | Truck desk 5,575 px; Audit 3,139 px; Performance 2,612 px | Important things sit far below the fold. Truck desk mixes the fleet, queues and expenses on one page. |
| F9 | **Stale labels** | Audit "Feature" filter still lists "Purchase orders (drafts)" | Leftovers from the PO rework. |
| F10 | **Pages with no summary at all** where one would help | Re-exports, Users (has counts) | Re-exports needs open / loaded / in transit / delivered counts. |

## 3. The rule (page types)
| Type | Opens on | Top of page | Analysis |
|---|---|---|---|
| **Work** | the list / queue, filtered to "needs action" when there is any | **Summary strip**: max 4 counts, each one a filter for the list (e.g. "5 delayed" → list filtered to delayed) | A link "See the analysis → Home · Fleet tab". No charts on the page. |
| **Analysis** | the charts | KPI row + charts | The page *is* the analysis |
| **Monitoring** | the live board or map | status counts | Links to records |
| **Record / settings** | the record or form | none | none |

Shared page layout, used everywhere:
1. Header: title, one-line plain description, primary action on the right.
2. Summary strip (work pages only).
3. Filters in one row.
4. Table or board.
5. Detail in a side drawer or detail page.

Explanations live in ⓘ popovers, not paragraphs.

## 4. Page-by-page decision
| Page (today) | Main user | Type | Opens on (proposed) | Summary strip / notes |
|---|---|---|---|---|
| Home (tabs) | everyone | Analysis | My dashboards | **Only place for dashboards.** Absorbs the Reports page tabs and the page Overview tabs. |
| Period plans | Kabonge, directors | Work | Plan list | In force · upcoming · % used vs expected. Plan-vs-actual chart → Home · Purchasing. Keep "Plan / check a period" here (moved from Reports). |
| Purchase orders | Kabonge, directors | Work | Order list | Created · not sent · loading · on the road. Version history stays on the PO page. |
| Loading & waiting list | Kabonge, Testfie | Work | Queue (per loading point) | Trucks waiting · longest wait · lines to load · loaded today. **Merge into the Truck desk "Queues" tab.** |
| Shipments | Testfie, directors | Work | Shipment list (active first) | On the road · delayed · at border · no check-in. "Map view" toggle replaces the separate Tracking page. |
| Tracking map | Testfie, directors | Monitoring | Map | **Becomes the Map view of Shipments / Truck desk.** |
| Truck desk | Testfie | Monitoring | Fleet board (by status) | Split into tabs **Board · Queues · Providers & trucks · Costs** (fixes the 5,575 px page). |
| Re-export orders | Asie, directors | Work | Order list | Open · loaded · in transit · delivered (new). |
| Inventory + Warehouse stock | directors / Asie, Yonas | Work | **One "Stock" page.**<br>Receivers: quantities by warehouse, Count / adjust.<br>Directors: adds value and in-transit columns. | Stock value* · cases on hand · in transit · needs attention. *Value only for directors. |
| Warehouse expenses | Asie, Yonas, directors | Work | Expense list (this month) | This month total · vs last month · largest category. |
| Sales | directors | Work | Sales list | Sales this month · credit outstanding · overdue. Charts → Home · Sales tab. |
| Sales velocity | directors | Analysis | **Retire.** It becomes "Fast & slow products" on the Home · Warehouse tab, where it already exists. | |
| Performance | directors | Analysis | Charts (as today) | Collapse the long page into sections: Summary · Products · Trucks · Pricing helper. |
| Selling prices | directors | Work | Price list | Missing prices · below target margin. |
| Trip financials + Transport fees | directors, Testfie | Work | **One "Transport costs" page**, tabs **Fees (default) · Trips · Expenses** | Open balance · over 14 d · over 30 d · price not recorded. |
| Reports | directors, Kabonge | Analysis | **Retire.**<br>• Tabs move into Home (Sales, Logistics, Inventory, Finance, Quarterly review).<br>• "Plan / check a period" moves to Period plans. | |
| Master data, Users, Audit, Notifications, Integrations | directors, Kabonge | Record / settings | as today | Audit: compact sparkline, list first. |

Effect on the sidebar: **22 → 15 entries**:
- **Overview:** Home
- **Procurement:** Period plans, Purchase orders
- **Logistics:** Truck desk, Shipments, Re-exports
- **Stock & sales:** Stock, Warehouse expenses, Sales
- **Finance:** Performance, Selling prices, Transport costs
- **Admin:** Master data, Users, Audit, Notifications (Integrations moves into Admin settings)

Old links keep working through redirects.

## 5. Engineering plan
**Phase 0: trust the numbers (first; small)**
1. **Fix the USD 3,050,000 data bug.** Find the source (seed or currency handling).
   - Add amount sanity checks on agreed price, expenses and payments: an amount per currency over a set limit asks "are you sure?", and the server refuses impossible values.
   - Add a currency-mismatch warning.
2. **One metric registry** (`packages/api/src/metrics.ts`): a single definition for each shared figure ("on the road", "delivered", "delayed", "open balance", "stock value", …). Home, the summary strips, the phone and the PDF exports all use it. QA test: the same figure is equal on every surface (F3).
3. **Clean the UI text:** remove spec codes from user-facing text (F7) and stale labels (F9). Add a lint check that fails the build if `§`, `docs/` or `XX-00` codes appear in screen text.

**Phase 1: page types**
4. A shared `<SummaryStrip>` component (counts that filter the list), a `<PageHeader>` with one primary action, and a `<CompanyPicker>` that asks for the company inside the action dialog in Group view (F6).
5. **Work pages open on the list** (F1). Remove the 8 Overview tabs. Each page gets its summary strip plus a "See the analysis →" link to the matching Home tab.
6. Re-exports, Selling prices and Warehouse expenses get summary strips (F10).

**Phase 2: merge overlapping pages (F5)**
7. Stock (Inventory + Warehouse stock), Transport costs (Trip financials + Transport fees), Truck desk tabs (Board / Queues / Providers & trucks / Costs, absorbing Loading), Map view on Shipments (absorbing Tracking).
8. Retire Reports and Sales velocity: move their tabs into Home and "Plan / check a period" into Period plans, with redirects.
9. Shorten long pages (F8): Performance sections, Truck desk tabs, Audit list first.

**Phase 3: check and finish**
10. Update the phone team app the same way. It is already list-first, so this is mostly the shared metrics and the new names.
11. Tests:
    - every old route redirects
    - figures are equal across surfaces
    - each role's default page and summary strip
    - the full journey test (e2e)
12. Docs, deck and demo refresh.

Each phase ends with `pnpm verify`, QA and e2e green, and a demo update. Phase 0 is independent and should ship first.

## 6. Decisions for you
1. Retire the **Reports** page into Home tabs? (Recommended — removes the third copy.)
2. Merge **Inventory + Warehouse stock** → "Stock", and **Trip financials + Transport fees** → "Transport costs"? (Recommended.)
3. Fold **Loading** into Truck desk and **Tracking** into a Map view? Loaders work on the phone, so the web Loading page is used by Kabonge and Testfie only. (Recommended.)
4. Keep **Performance** as a separate page, or make it the Home "Business" tab? (Recommended: keep. It is the directors' pricing workspace.)
