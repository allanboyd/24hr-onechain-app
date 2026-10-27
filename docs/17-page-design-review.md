# 17 — Page design review: which pages start with an overview (26 Oct 2026; Phases 0–3 built 27 Oct 2026)

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

## 7. Status: built (27 Oct 2026)
Your decisions (§6): **1** Reports retired into Home · **2** Stock and Transport costs merged · **3** Loading folded into the Truck desk, Tracking into a Map view · **4** Performance kept as its own page. Phase 0 is in [doc 18](18-metrics.md); Phases 1–3 are built as below. Tracker: [CHECKLIST](CHECKLIST.md) F-1 … F-3.

### 7.1 Sidebar (16 entries)
Home · Period plans · Purchase orders · Truck desk · Shipments · Re-export orders · Stock · Warehouse expenses · Sales · Performance · Selling prices · Transport costs · Master data · Users & devices · Audit log · Notifications. (§4 says "22 → 15"; its own list has 16 — the old sidebar had 23.) Integrations left the sidebar: it opens from **Master data → Admin settings** (same `integrations` feature). Each role still sees only the entries its features allow ([doc 12](12-roles-access.md)): Truck desk = `trucks` or `loading` (loaders see only its Queues tab), Stock = `inventory` or `warehouse-stock`, Transport costs = `finance` or `transport-fees`.

### 7.2 What each page opens on
| Page | Opens on | Summary strip (metric registry, [doc 18](18-metrics.md)) | Needs-action default (only when the address names no filter) |
|---|---|---|---|
| Period plans | plan list | In force today · Upcoming · Plan used this quarter (vs expected by today, not a filter) | none — plans are suggestions, nothing waits |
| Purchase orders | order list | (Awaiting approval, when approvals are on) · Not sent · (Sent, waiting to load, when approvals are off) · Loading · On the road (orders) | directors with approvals on → Awaiting approval; planners → Not sent |
| Truck desk | Board tab | Board: status counts; Queues: Trucks waiting · Longest wait · Trucks to load · Loaded today; Costs: transport owed · price not recorded | see §7.3 |
| Shipments | list (Map view toggle `?view=map`) | On the road · Delayed · At a border · No check-in | Truck desk users → Delayed when any; everyone else → On the road |
| Re-export orders | order list | Open · Loaded · In transit · Delivered | the person who loads (Asie) → Open when any |
| Stock | stock list | Stock value (prices only) · Cases on hand · In transit · Needs attention | people who see prices → Needs attention when any; receivers → every line of their warehouses |
| Warehouse expenses | this month's expenses | This month · Last month (with the change) · Largest category | This month |
| Sales | sales list, latest first | Sales this month · Owed by customers · Overdue | none — people come to record and look up sales; overdue is on Today |
| Selling prices | price list | Missing prices · Below target margin | Missing prices when any, else Below target |
| Transport costs | Fees tab | Open balance · Over 14 d · Over 30 d · Price not recorded | see §7.3 |
| Performance | Summary section | KPI row (analysis page) | sections Summary · Products · Trucks · Pricing helper (`?tab=`) |

Every work page has the shared header (title, one-line description, ⓘ, one primary action through `ActionInCompany`, "See the analysis → Home · …") and a filter bar whose filters live in the address. The "Choose a company to record …: BTW / NUD / Kivu" rows are gone: in the Group view the action asks "Which company?".

### 7.3 Merged pages
- **Truck desk** (`#/trucks?tab=board|queues|providers|costs`): *Board* (needs `trucks`) — strip on the road · delayed · at a border · waiting to load (`deskKpis`, same road state as Home), tiles filter the truck list (`show`), idle trucks folded behind "Show N idle trucks", detail in a drawer; *Queues* (needs `loading`; loaders see only this tab) — everything of the old Loading page: per loading point (`lp`), reorder / move / remove with a reason, add a known or market truck, record loading, waiting to be loaded, recently loaded; strip trucks waiting · longest wait · trucks to load · loaded today; *Providers & trucks* (needs `trucks`) — providers, trucks and drivers (editing as in Master data); *Costs* (needs `truck-expenses` or `finance`) — transport owed by provider and by truck, record agreed price / trip expense; strip transport owed · price not recorded · waiting for a director. Heights at 1280 px: Board ≈ 1,240 px, Queues ≈ 900, Costs ≈ 1,390 (was 5,575 px for the whole page). Providers & trucks is still long (one card per provider, ≈ 3,400 px).
- **Transport costs** (`#/transport-costs?tab=fees|trips|expenses`): *Fees* (needs `transport-fees`; default) — agreed vs paid per trip, references, age flags, record payment / approve; *Trips* (needs `finance`) — per-trip costs, landing cost, payments, provider balances folded; *Expenses* (needs `finance` or `truck-expenses`) — every trip cost line with kind / provider / route / month filters. One strip on every tab (open balance · over 14 d · over 30 d · price not recorded; finance-only roles get the same figures from the trips). Default for people who record payments: *Over 30 days* when any, else *Over 14 days*. Testfie records agreed prices and expenses, never payments; directors record and approve; every amount goes through the unusual-amount check.
- **Stock** (`#/stock`): one line per company × warehouse × product with the movements of the last 30 days (opening, received, damaged, short, sent on / out, sold, count ±, on hand, in transit, level and cover, last count) and *Count / adjust*; directors and other price roles also see landed cost and value. Receivers keep *In transit* (their tile filters on it). Detail drawer: movements, counts and adjustments, the stock ledger.
- **Shipments** Map view: the trucks of the filtered list on the map (Leaflet still loads lazily); the strip and filters apply to both views.

### 7.4 Analysis moved to Home (nothing dropped)
New Home sections (browser-built, `analysis: true` entries in `packages/api/src/dashboards.ts`, rendered by `screens/dash/Analysis.svelte` under the tab's dashboards, using the Home period / warehouse / product filters):

| Home tab | Section | From |
|---|---|---|
| Purchasing | Orders (truck progress per order, trucks by stage, value by supplier and month) · Planned vs actual · Purchase planning | POs Overview tab · Reports → Planned vs actual, Planning |
| Loading | Loading queues (queue and wait per loading point, loaded per day, ordered vs loaded) | Loading Overview tab |
| Fleet | Trucks and deliveries (by status, on time, worst legs) · Logistics report | Shipments Overview tab · Reports → Logistics |
| Fees & expenses | Trip costs (expenses by month, payments awaiting approval) · Landing cost report | Trip financials Overview tab · Reports → Finance |
| Warehouse | Fast and slow products (moved from Business) · Stock positions · Stock report · Sales velocity | Inventory Overview tab · Reports → Inventory · Sales velocity page |
| Sales | Sales report · Quarterly review | Reports → Sales, Quarterly review (the Sales Overview tab duplicated these and Home · Sales and was removed) |

"Plan or check a period" is now `#/period-plans/check` (secondary action on Period plans; the check needs the Reports feature). Charts that already existed on Home were not copied (e.g. "transit time by lane" and "border waits" from the Shipments Overview tab: the Logistics report and the border heatmap show them; the "X by company" charts: Home · Companies). Access is unchanged: each section opens for the same audiences / features as the page it came from (`features` on the entry, e.g. the Reports feature).

### 7.5 Redirects (`apps/web/src/lib/redirects.ts`)
| Old | New |
|---|---|
| `#/inventory?…`, `#/warehouse-stock?…` | `#/stock?…` |
| `#/finance?…` | `#/transport-costs?tab=trips&…` |
| `#/transport-fees?…` | `#/transport-costs?…` (Fees) |
| `#/loading?lp=…` | `#/trucks?tab=queues&lp=…` |
| `#/tracking` | `#/shipments?view=map` |
| `#/analytics` | `#/dashboards/warehouse` |
| `#/reports?r=sales / quarterly / logistics / inventory / pv / planning / finance` | `#/dashboards/sales / sales / fleet / warehouse / purchasing / purchasing / fees` |
| `#/reports?r=period&mode=…&wh=…` | `#/period-plans/check?mode=…&wh=…` |
| `?tab=overview`, `?tab=list` on any page | dropped |
| `#/shipments?chip=Delayed / At border / no-checkin / Acknowledged / active` | `#/shipments?show=delayed / border / noCheckin / delivered / road` |
| `#/trucks?view=expenses` | `#/trucks?tab=costs` |

Every hash link in the shared code (dashboards drill-downs, alerts, notifications from the server and the mock, reports, e-mails) was moved to the new routes; `packages/api/test/redirects.test.ts` fails the build if a retired route or an old filter appears again. The phone maps the new links (`#/trucks?tab=queues` → Queue, `#/transport-costs` → Money, `#/stock`).

### 7.6 Removed
Pages: Inventory, Warehouse stock, Trip financials, Transport fees, Loading & waiting list, Tracking map, Sales velocity, Reports. Components: the Overview / List tabs (`PageTabs`, `lib/tab.ts currentTab`), the Sales overview.

### 7.7 Tests (27 Oct 2026)
- `pnpm test`: new `packages/api/test/redirects.test.ts` (206 checks: every old route and filter → the new page, no redirect chains, every target / sidebar entry / dashboard drill-down is a route, no retired link or old filter left in the shared code, the sidebar list, Home analysis access per role, the phone mapping); `metrics.test.ts` now 138 checks (the new strips: orders by stage, plans, queues, re-exports, expenses, sales overdue — page helper = registry, five scopes).
- `pnpm verify` green; QA 1,179 / 1,179; e2e journeys updated (old links land on the new pages, the loader lands on the queues, the viewport checks cover the new pages).

### 7.8 Deviations
- Sidebar has 16 entries, not 15 (see §7.1).
- *Fast and slow products* moved from Home · Business to Home · Warehouse (next to Sales velocity), as §4 assumed it already was.
- Sales has no needs-action default; Period plans neither (see §7.2).
- Group view on the Truck desk: header actions carry the intent in the link so the tab and loading point survive the company switch; *Record loading* still switches to the order's own company with one button.
- The metric registry moved to `packages/api/src/metric-registry.ts` (functions stay in `metrics.ts`) so the definitions stay out of the entry chunks — web entry 107.8 KB (was 109.1), phone 85.3 KB (was 85.2; the sales report now also returns the overdue part).
- Deck and demo refresh not redone; mockup flows (`tools/mockups`) dropped `tab=list` but still open some old routes, which redirect.
