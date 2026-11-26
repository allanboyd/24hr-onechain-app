# 23 · Design v3: Operations and Management

**Branch:** `design-v3` (rows branch from it and merge back into it; `main` gets it when you accept the whole design)
**Status:** plan written 26 Nov 2026 · **waiting for your review** (§8) · rows on [`work/BOARD.md`](work/BOARD.md#design-v3)

**Sources (in the repo, open them in a browser):**
- [`design-v3/reference/operations-and-management.html`](design-v3/reference/operations-and-management.html): the new design for the whole platform (Operations + Management)
- [`design-v3/reference/management-room-report.html`](design-v3/reference/management-room-report.html): the directors' report used **as is** for Management
- Screenshots: [`design-v3/shots/`](design-v3/shots/)

## 1. What changes, in one line each
1. **Two sides, one switch.** The top of the sidebar has an **Operations | Management** switch. Operations is the day-to-day work. Management is reports and everything around them.
2. **Operations keeps every process step as it is today** (plans → POs → loading → road → receiving → stock → sales). Only the look changes, and the menu is ordered by the step in the process.
3. **Management = the directors' report, as is** (its 7 pages), for now. Our current dashboards (Home tabs) and other analysis move under Management too.
4. **Removed from the menu (commented out, code kept):** Performance, Selling prices.
5. **Content is centred** (max width, equal margins), not stuck to the left.
6. **New look:** cards without borders and with a soft shadow, rounder corners, pill chips, a dark sidebar with a filled active item, and a "who handles it" pipeline.
7. **PWA:** the office web app can be installed too; the phone app gets an install page and shows "a new version is ready", and gets the new look.

## 2. Sidebar

### Operations (ordered by the process)
| Group | Item | Today | Change |
|---|---|---|---|
| Overview | **Today** | Home (dashboards) | New Operations home: what needs action now and who handles it (see §4). Dashboards move to Management. |
| 1 · Plan and order | Period plans | same | look only |
| | Purchase orders | same | look only |
| 2 · Load and move | Truck desk | same | look only (Board · Loading queues · Providers & trucks · Haulage & costs) |
| | Shipments | same | look only |
| | Goods transfers | Re-export orders | renamed in the menu, as in the design (to confirm, §8) |
| 3 · Receive and store | Stock | same | look only |
| | Warehouse expenses | same | look only |
| 4 · Sell | Sales | same | look only |
| Admin | Master data | same | |
| | Users & access | Users & devices | renamed in the menu |
| | Audit log | same | |
| | Alerts | Notifications | renamed in the menu; adds "What I receive" switches like the design (saved per user) |
| ~~Finance~~ | ~~Performance~~ | | **commented out** of the menu; route kept, opens only by link |
| | ~~Selling prices~~ | | **commented out** of the menu; route kept. Sales still uses the saved prices. |
| | Transport costs | sidebar | taken off the sidebar (the design has it as the Truck desk tab "Haulage & costs"). Route kept. |

Group labels follow the design (Overview · Procurement · Logistics · Stock & sales · Admin), so the order is the process order.

### Management
| Item | Source |
|---|---|
| Overview | report page `overview` |
| Executive report | report page |
| Plans and orders | report page |
| Sales and clients | report page |
| Supplier balances | report page |
| Cash and closing | report page |
| Warehouse performance | report page |
| Live dashboards | our current Home tabs (real data), until the report reads live data (to confirm, §8) |

The "See the analysis → Management · …" links on Operations pages open the matching Management page.

**Who sees the switch:** people with dashboard access (directors, and others as the role matrix allows). Everyone else sees Operations only, as today.

## 3. Management room: "as is"
- The report file is copied **unchanged** to `apps/web/public/management/report.html` and shown inside our shell (same-origin frame).
- Our sidebar drives it: picking "Supplier balances" selects that page in the report. The report's own sidebar is hidden so you don't see two menus. Its filters, charts, tables and the "Ask the management room" assistant work as they do in the file.
- Report page keys (from the file): `overview`, `exec`, `plans`, `clients`, `suppliers`, `cash`, `perf` (in its menu), plus `fleet`, `stock`, `expenses` (not in its menu; used by "See the analysis →" links from Truck desk, Stock and Warehouse expenses). Our route is `#/management/<key>`. The frame is hidden with `aside.side { display: none }`, and a page is chosen by clicking `#nav button[data-k=<key>]` inside the same-origin frame (or calling its `show()`).
- **It shows the sample data built into the file** ("Sample data · USD"). A clear banner says so. Wiring it to live data is a later phase (§7).
- The 1.1 MB file loads only when someone opens Management, so the app's size budget is not affected.

## 4. Operations · Today (new home)
Built from data we already have (metric registry, decisions list, roster). No new API unless a number is missing.
- KPI cards: Waiting to load · On the road (with no check-in) · Delayed · To acknowledge · Transport fees owed · Stock critical.
- **Pipeline strip** with owners: Waiting to load (loader) → Loaded, not dispatched → On the road (driver app / truck follow-up) → Delivered, not acknowledged (warehouse) → Acknowledged.
- **Act on these first:** late trucks, no check-in, short loads, unpaid fees, each with a link (Truck desk →).
- **Who handles what:** step → people, from the roster.
- Each role still opens on its own home (truck planner → Truck desk, etc.).

## 5. The look (tokens, done once, used everywhere)
| | Now | v3 |
|---|---|---|
| Content | left-aligned, max 1440 | **centred**, max ≈ 1240 px, equal margins |
| Cards | 1 px border, radius 10 | no border, soft two-layer shadow, radius 18 |
| KPI cards | mixed | label · big value · coloured foot line, same height |
| Chips / status | square-ish | pills with a tinted background |
| Sidebar | navy, orange left bar on active | dark navy, active item filled, process groups |
| Buttons | radius 6 | radius 12 (pill for filters / tabs) |
| Tables | uppercase headers | small muted headers, more row space, nowrap ids |
| Page header | overline + big title | kept: small group label, 28 px title, one-line lead, "See the analysis →" link |

The design uses emoji as icons. We keep **Lucide** icons, because emoji show as empty boxes on some PCs (they did in our test render).

## 6. PWA and phones
| What | Now | v3 |
|---|---|---|
| Phone app (BTW Team) | installable PWA, offline, install prompt; updates apply silently on the next load | **"New version ready · Update"** banner, a version number on the profile screen, the new look (aesthetics only, same steps) |
| Install | the link is copied from the login page | an **Install page** (`/install`): QR code, Android / iPhone steps, the "Install" button where the browser supports it |
| Office web app | not installable | manifest + small service worker (app shell only, no offline data) so it installs on a PC or phone |
| Android APK (Capacitor) | built by `pnpm android:build` | rebuilt from the same code once the look is done |

## 7. Not in this round
- The report reading live data (next phase, after you approve the pages as they are).
- Changes to process steps, rules or the API.
- New reports beyond the 7 report pages.

## 8. Decisions for you (proposals in bold)
1. **Live dashboards:** keep our current dashboards under Management as "Live dashboards" while the report shows sample data? **Yes.**
2. **Renames** in the menu (Re-export orders → Goods transfers, Users & devices → Users & access, Notifications → Alerts)? **Yes, menu labels only.**
3. **Transport costs** off the sidebar, reached from the Truck desk tab? **Yes.**
4. **Who sees Management:** directors plus roles that have dashboards today? **Yes.**
5. **Office web app installable** (PC and phone), not only the phone app? **Yes.**

## 9. Rows (parallel, on the board)
```
V3-0 Look + tokens ──┬── V3-1 Shell: switch + menus ── V3-3 Operations Today
  (first, small)     ├── V3-4 Operations pages look
                     └── V3-6 Phone app look
V3-2 Management room (as is) ── can start now
V3-5 PWA (web + phone install/update) ── can start now
V3-7 Review + QA ── after each merge into design-v3
```
UI-0…UI-4 from doc 22 are folded into V3-0 / V3-1 / V3-4 (same issue IDs, so nothing is lost). UI-5 (dashboard card bug) stays, because those dashboards move to Management → Live dashboards.
