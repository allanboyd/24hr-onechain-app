# Work board

How to use it: [`AGENTS.md`](../../AGENTS.md). Each agent edits **only its own row**, plus lines under Requests and Log.

**Status:** ⬜ open · 📝 planned (waiting for approval) · 🔄 in progress · ⏸ handed over (read the plan's Handover section) · 👀 review · ✅ done · ⛔ blocked

## Who does what (26 Nov 2026, agreed with the human)
Two agents work in parallel on `design-v3`. Each edits only its own files; anything shared goes under **Requests**. Rebase on the latest `design-v3` before every merge.

| Agent | Rows | Files it owns |
|---|---|---|
| **cursor** | V3-11 to the end (Live dashboards: card titles, heatmap, the other tabs), then V3-9 (new dropdowns) | `apps/web/src/screens/dash/**`, `apps/web/src/components/dashboard/**` (incl. `report.css`), `apps/web/src/components/charts/**`, `packages/ui/**` |
| **claude** | V3-10 (Supplier balances, Cash and closing, Executive report, then recording the missing data), then V3-8 batch 2 (Users, Audit log, Master data, Truck desk tables) | `packages/api/src/dashboards.ts` (management builders), **all of `apps/web/src/screens/management/**`** (the human put claude in charge of the Management pages, 26 Nov; rules in `.cursor/rules/management-pages.mdc`), `apps/web/src/screens/Users.svelte`, `Audit.svelte`, `MasterData.svelte`, `apps/web/src/components/trucks/**`, `apps/web/src/components/*Tab.svelte` |

Shared (ask under Requests): `components/dashboard/report.css` (claude reuses, cursor edits), `App.svelte`, `routes.ts`, `package.json`.

## Design v3
**Base branch: `design-v3`** (worktrees branch from it, PRs/merges go back into it). Plan: [doc 23](../23-design-v3.md). Rows need `Approved: yes` in their plan file.

| ID | Title | Status | Agent | Branch | Depends | Owns | Port |
|---|---|---|---|---|---|---|---|
| V3-0 | Look + tokens: centred content, cards, chips, buttons, tables, page header (folds in UI-0, UI-4 T-/P- issues) ([plan](plans/V3-0.md)) | 👀 review (merged into design-v3) | claude | `v3/V3-0-look` | none | `docs/design-system/tokens.json`, `packages/tokens/**`, `packages/ui/src/**`, `apps/web/src/components/page/**` | 5230 |
| V3-1 | Shell: Operations / Management switch, process-ordered menus, Performance + Selling prices commented out (folds in UI-1) ([plan](plans/V3-1.md)) | 👀 review (merged into design-v3) | claude | `v3/V3-1-shell` | V3-0 | `apps/web/src/App.svelte`, `apps/web/src/routes.ts`, `components/CompanySwitcher.svelte`, `components/CompanyMark.svelte`, `apps/web/src/lib/side.svelte.ts` (new) | 5231 |
| V3-1b | Shell polish: sidebar logo + company select, no group titles, animated switch, modern top bar, collapsible sidebar ([plan](plans/V3-1b.md)) | 👀 review (merged into design-v3) | claude | `v3/V3-1b-shell-polish` | V3-1 | same as V3-1 | 5231 |
| V3-1c | Small fix: Management menu spaced in groups like Operations (your 26 Nov note) | 👀 review (merged into design-v3) | claude | `v3/V3-1c-mgmt-spacing` | V3-1b | `routes.ts` (managementNav) | 5231 |
| V3-1e | Small fix: Live dashboards moves to the Operations menu for everyone; each tab still shows only what the person's role may see; `#/dashboards` opens the first dashboard tab (your 26 Nov note) | 👀 review (merged into design-v3) | claude | `v3/V3-1e-live-in-ops` | V3-1 | `routes.ts`, one line in `screens/dash/Home.svelte` (tab default; cursor informed below) | 5231 |
| V3-1f | Small fix: one **Home** entry in Operations (Live dashboards removed from the menu: same page and tabs); every dashboard tab keeps Home selected (your 26 Nov note) | 👀 review (merged into design-v3) | claude | `v3/V3-1f-one-home` | V3-1e | `routes.ts`, `App.svelte` (`active`) | 5231 |
| V3-1g | Small fix: **System settings & logs** in the Operations sidebar (Users & access, Audit log, Settings as tabs; the separate entries go) and **Shipment map** under Shipments (your 26 Nov note) | 👀 review (merged into design-v3) | claude | `v3/V3-1g-system-map` | V3-1f | `routes.ts`, `App.svelte` (`match`), new `components/SystemNav.svelte`, `screens/SystemSettings.svelte`, `Users.svelte` / `Audit.svelte` headers | 5231 |
| V3-2 | Management room: the report as is, driven by our sidebar, sample-data banner ([plan](plans/V3-2.md)) | 👀 review (merged into design-v3) | claude | `v3/V3-2-management` | none (menu entries via V3-1) | `apps/web/public/management/**`, `apps/web/src/screens/management/**` | 5232 |
| V3-3 | Operations · Today: KPIs, pipeline with owners, act on these first, who handles what | ⬜ open | | `v3/V3-3-today` | V3-0, V3-1 | `apps/web/src/screens/ops/**` | 5233 |
| V3-4 | Operations pages look: POs, Truck desk, Shipments, transfers, Stock, expenses, Sales, Period plans, Admin pages, Alerts "What I receive" (folds in UI-3 forms) | ⬜ open | | `v3/V3-4-ops-pages` | V3-0 | `apps/web/src/screens/*.svelte` (not Login), `apps/web/src/components/**` except `page/**`, `dashboard/**`, `charts/**` | 5234 |
| V3-5 | PWA: web app installable, phone "new version ready", `/install` page with QR ([plan](plans/V3-5.md)) | 👀 review (merged into design-v3) | claude | `v3/V3-5-pwa` | none | `apps/web/public/manifest.webmanifest`, `apps/web/public/icons/**`, `apps/web/sw.template.js`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/pwa/**`, `apps/field/src/pwa/**`, `apps/field/sw.template.js`, `apps/field/vite.config.ts`, `apps/field/public/manifest.webmanifest` | 5235 |
| V3-6 | Phone app look (same steps) + login web and phone (folds in UI-2) | ⬜ open | | `v3/V3-6-phone` | V3-0 | `apps/field/src/**` except `pwa/**`, `apps/web/src/screens/Login.svelte` | 5236 / 5226 |
| V3-7 | Review + QA: mockup flows, e2e, review board, before/after gallery | ⬜ open | | `v3/V3-7-qa` | each merge | `tools/mockups/**`, `tests/**` | 5237 |
| V3-10 | Management pages in our code on live data, reusing the dashboard builders; keep the report's look and indicators ([plan](plans/V3-10.md)) | 👀 review: all seven Management pages on live data; next step 4 (recording the missing data), then V3-8 batch 2 | claude | `v3/V3-10-management-live` | V3-2 | `apps/web/src/screens/management/**`, `packages/api/src/management.ts` (new), `apps/api/src/management/**` (new) | 5240 |
| V3-11 | Live dashboards in the Management report's layout; Fleet sections scroll on their own, no page scroll (your 26 Nov note; folds in UI-5) ([plan](plans/V3-11.md)) | 👀 review: report layout on the Live dashboard tabs (LD-1 through LD-4) | cursor | `v3/V3-11-report-layout` | V3-10 step 1 | `apps/web/src/screens/dash/**`, `apps/web/src/components/dashboard/**`, `apps/web/src/components/charts/Heatmap.svelte` | 5242 |
| V3-12 | Money records from the work itself: clients + credit terms and client payments (Sales, web + phone), pro-formas / advances / credit notes (PO page), opening cash + transfers (Warehouse expenses); replaces V3-10 step 4 ([plan](plans/V3-12.md)) | 👀 review: steps 0–4 merged (Settings; clients + credit days; client payments; supplier money on the PO; warehouse cash) | claude | `v3/V3-12-money-records` | V3-10 | `apps/api/src/db/schema.ts`, `apps/api/drizzle/0013_*`, `apps/api/src/domain/**`, `packages/api/src/**` (types, mock, rules, metrics, dashboards), `Sales.svelte`, `POView.svelte`, `WarehouseExpenses.svelte`, `MasterData.svelte`, `components/ClientsTab.svelte` (new), `SuppliersTab.svelte`, `apps/field/src/team/**` (sales), `screens/management/**` | 5243 |
| V3-13 | Settings & alerts workspace: internal left menu (Alerts, My notifications, Approvals, Exchange rates, Thresholds, Users & access, Audit log, Integrations); Alerts moves out of the main sidebar ([plan](plans/V3-13.md)) | 👀 review: steps 1-3 merged (workspace with a left menu; Alerts with open exceptions and inbox; Approvals rules, Exchange rates, Thresholds) | claude | `v3/V3-13-settings-workspace` | V3-1g | `routes.ts`, `App.svelte`, `screens/system/**` (new), `Users.svelte`, `Audit.svelte`, `Integrations.svelte`, `Notifications.svelte`, `management/Settings.svelte` | 5244 |
| V3-8 | Tables: modern table library with search + filters, 68 tables / 47 files ([plan](plans/V3-8.md)) | 👀 review: phase 1 merged (engine + POs pilot); phase 2 next | claude | `v3/V3-8-tables` | V3-0 | `apps/web/src/components/page/DataTable.svelte`, `datatable.ts`, then table markup per screen (coordinate with V3-4) | 5238 |
| V3-9 | Selects: modern select + combobox, 125 selects / 45 files ([plan](plans/V3-9.md)) | 📝 planned (Bits UI approved, not started) | | `v3/V3-9-selects` | V3-0 | `packages/ui/src/Select*.svelte`, `Combobox*.svelte`, then select markup per screen (coordinate with V3-4) | 5239 |

Start now: **V3-0, V3-2, V3-5**. Then V3-1, V3-4, V3-6 in parallel; V3-3 after V3-1.

## UI cleanup ([doc 22](../22-ui-cleanup.md)) · base branch `main`
UI-0…UI-4 are **⏸ parked**: folded into Design v3 (same issue IDs). UI-5 stays.

| ID | Title | Status | Agent | Branch | Depends | Owns | Port |
|---|---|---|---|---|---|---|---|
| UI-0 | Foundation: tokens, `.select`, `Field`, `IconButton`, `Menu` ([plan](plans/UI-0.md)) | ⏸ parked (in V3-0) | | `ui/UI-0-foundation` | none | `docs/design-system/tokens.json`, `packages/tokens/**`, `packages/ui/src/**`, `scripts/build-tokens.mjs` | 5210 |
| UI-1 | Shell: sidebar + top bar (S-1…S-7) | ⏸ parked (in V3) | | | UI-0 | `apps/web/src/App.svelte`, `components/CompanySwitcher.svelte`, `components/CompanyMark.svelte`, `nav` in `routes.ts` | 5211 |
| UI-2 | Login, web + phone (L-1…L-3) | ⏸ parked (in V3) | | | UI-0 | `apps/web/src/screens/Login.svelte`, `apps/field/src/screens/Login.svelte` | 5212 |
| UI-3 | Forms (F-1, F-2, F-4…F-7) | ⏸ parked (in V3) | | | UI-0 | `screens/PoEdit.svelte`, `PeriodPlanNew.svelte`, `PeriodCheck.svelte`, `SellingPrices.svelte`, `components/ProductPicker.svelte`, `ReplaceDialog.svelte`, `StaticDialog.svelte`, `components/*Tab.svelte` | 5213 |
| UI-4 | Lists + page header (T-1…T-5, P-1) | ⏸ parked (in V3) | | | UI-0 | `apps/web/src/components/page/**`, table cells in `POs`, `Shipments`, `MasterData`, `Stock`, `Sales` screens | 5214 |
| UI-5 | Dashboard cards (D-1…D-4) ([plan](plans/UI-5.md)) | 📝 planned | claude | `ui/UI-5-dashboard-cards` | none | `apps/web/src/components/dashboard/**`, `components/charts/**`, `screens/dash/**` | 5215 |
| UI-6 | Review + QA: mockup flows, review board | ⬜ open | | | each merge | `tools/mockups/**`, `tests/**` | 5216 |

UI-5 can start on `main` or move to `design-v3`; its plan is still valid.

## Decisions waiting for the human
Design v3: [doc 23 §8](../23-design-v3.md#8-decisions-for-you-proposals-in-bold) (live dashboards, renames, transport costs, who sees Management, installable web app).
See [doc 22 §5](../22-ui-cleanup.md#5-decisions-needed-from-you): fonts, accent, sidebar collapse, demo users on login.

## Bugs found
<!-- BUG-<n> · where · steps · screenshot · found by <agent> (gets its own row once triaged) -->
- **BUG-1** · `packages/api/test/plans.test.ts` lines 110, 141, 142 fail on unchanged `design-v3` (and `main`): over-plan mark / Kivu plan link / over-plan PO issued. Likely date-driven (the demo plan period vs today, 26 Nov). Run: `npx tsx packages/api/test/plans.test.ts`. Found by claude (V3-0).
- **BUG-3** · ✅ fixed in V3-8 batch 1: Stock's table listed every line whatever the filters (the strip said "6 of 20"). Found by claude.
- **BUG-4** · ✅ fixed in V3-11: Group view → Sales → New sale → pick BTW now opens the form. The screen that was leaving reloaded on the company switch and consumed `do=` before the new screen could read it. Found by claude.
- **BUG-2** · `packages/api/test/metrics.test.ts`: "Group (Daniel) · needs attention: Inventory page 8 = stock report 9" fails on unchanged `design-v3`. The two pages count stock needing attention differently (probably also date-driven). Found by claude (V3-0).

## Requests
<!-- "<from> → <owner>: what you need" ; the owner answers on the same line -->
| claude → cursor | V3-13: plan thresholds now live in Settings & alerts → Thresholds (`#/system/thresholds`). The form in `components/reports/PlannedVsActualTab.svelte` (Period plans → Planned vs actual) could become a link there so there is one place to change them. Also: `screens/dash/panels/Business.svelte:105` "Parameter 's' implicitly has an 'any' type" fails `pnpm --filter @btw/web check` (from 3c24ff1). | open |
| claude → cursor | V3-12 step 1: credit days are per client now (Sales → Clients; default 14). Captions that say "{terms}-day terms" (`screens/dash/panels/Money.svelte:110`, `screens/dash/today/Today.svelte:206`) should read e.g. "credit days per client (14 unless set)". The ageing bands are now days past each sale's own credit days, named "Within terms", "1–30 days overdue", "Over 30 days overdue". | open |
| claude → cursor | **Live dashboards tabs, your 26 Nov note: "clean those dashboards to be proper like the management ones"** (V3-11). Review on :5173, 26 Nov: (1) every tab shows "Good morning, Daniel": like Management, each tab needs its own title + one-line description, then the filter bar (`.cursor/rules/management-pages.mdc`); the greeting only on Home. (2) Em dashes: empty cells show `—` in Purchasing (open orders), Fees, Warehouse (stock by brand), Companies; and in sentences on Deliveries ("— the vital few"), Sales ("fell −48% — check…"), Companies ("Order before you run out — by company"). Use `-` and plain sentences. (3) Business → Profit bridge: value labels and axis labels overlap ("USD 32.7K USD 24.1K", "Truck cost Warehouse share Other costs"). (4) Paired cards of very different heights leave big gaps (Business: Profit and margin vs Sales by month; Warehouse: Re-export orders alone at half width). (5) Warehouse tab is 5,400 px: 8 cards plus a whole Stock report below; Stock on hand and Stock by brand repeat; shorten like Management (KPIs, then pairs, then one table). (6) Negative stock shows as `-110` cases and `-30 d` cover (Bell Lager Bottles, Gisenyi): show 0 / "Out of stock" or flag it. (7) Stock movements: an empty chart takes a full card when there are no moves; use a short empty note. (8) Business → Landed cost per product shows one product and Landed cost per truck one non-zero bar: show "Not recorded yet" for the rest, as Management does. (9) Fast and slow products: dots have no labels. (10) Executive overview KPI tiles: labels wrap ("Trucks on the road") with large empty tiles. Also: `PlanCreateDialog.svelte:216` unused selector `.clash svg` fails `pnpm --filter @btw/web check` (from 1b619d7). Note: I changed one line in `screens/dash/Home.svelte` (`wanted`: `#/dashboards` opens the first dashboard tab) for V3-1e. | open |
- claude → cursor: `components/charts/ColumnsLine.svelte` formats the right axis as % even when `formatLine` is given (Supplier balances showed "1267031%"); please use `formatLine` for the axis ticks. Claude used GroupedBars meanwhile.
- V3-0 → V3-1: took one rule in `App.svelte` (centred `.content`, sidebar side tokens). V3-1 keeps it. ✅ done
- V3-2 → V3-1: added `/management` routes + a temporary Management nav group in `routes.ts` (+ `navOnly` on nav items). V3-1 moves it under the switch and can keep one report frame across Management pages. ✅ done in V3-1
- V3-2 → shared: `packages/api/test/redirects.test.ts` sidebar count now checks Operations (16) and Management (8) separately (doc 23).
- V3-1b → V3-7: updated `tools/mockups/flows/a-procurement.mjs` ("Open the menu") and `h-companies.mjs` (company listbox in the sidebar); please run them.
- V3-8 → shared: `@tanstack/table-core` + `@tanstack/svelte-table` added to `apps/web/package.json`; `apps/web/test/datatable.test.ts` added to the root `pnpm test`.
- V3-5 → shared: `qrcode-generator` added to `apps/field/package.json` (lockfile changes). `apps/web/src/main.ts` claimed for the PWA banner mount.

## Log
| Date | Who | What |
|---|---|---|
| 25 Nov 2026 | claude | Research written (doc 22), board and agent rules set up. |
| 25 Nov 2026 | claude | Added tests / fix log / handover rules (AGENTS.md §5–6). Plans for UI-0 and UI-5 written, waiting for approval. |
| 26 Nov 2026 | claude | Branch `design-v3` created. Doc 23 + V3 rows written; UI-0…UI-4 parked into V3. Waiting for review. |
| 26 Nov 2026 | claude | Decisions accepted + Home duplicated in Operations and Management for now. Plans V3-0, V3-2, V3-5 approved; started. |
| 26 Nov 2026 | claude | V3-0 merged into design-v3 (look + tokens). BUG-1, BUG-2 logged (pre-existing test failures). |
| 26 Nov 2026 | claude | V3-2 merged into design-v3: report as is under Management; `tests/design-v3/management.mjs` all pass on :5173. |
| 26 Nov 2026 | claude | V3-5 merged into design-v3: office app installable, phone update banner, install page (`/app/install.html`). `tests/design-v3/pwa.mjs` 12/12 on a production build. Next free rows: V3-1, V3-4, V3-6 (V3-0 is in). |
| 26 Nov 2026 | claude | V3-1 approved and started. |
| 26 Nov 2026 | claude | V3-1 merged into design-v3: switch, process-ordered menus, Performance / Selling prices / Transport costs off the menu (access kept), smaller brand without subtitles (your request). Next free: V3-3 (Today), V3-4 (pages look), V3-6 (phone look). |
| 26 Nov 2026 | claude | Your sidebar / top bar list → V3-1b (started). Tables → V3-8 and selects → V3-9 planned; each needs a library choice. |
| 26 Nov 2026 | claude | V3-1b merged into design-v3: sidebar logo + company select, no group titles, sliding switch, modern top bar, collapsible sidebar. `shell-polish.mjs` 19/19. |
| 26 Nov 2026 | claude | V3-1c merged (Management menu spacing). Your choices: TanStack Table, pages of 25 + Show more (V3-8, started); Bits UI, native picker on phones (V3-9, approved). |
| 26 Nov 2026 | claude | V3-8 phase 1 merged: DataTable on TanStack with search, Filters panel, chips; Purchase orders pilot. Engine test 25/25, tables.mjs all pass. Phase 2 (other screens) next. |
| 26 Nov 2026 | claude | V3-8 batch 1 merged: Shipments, Sales, Stock, Transport costs (Fees, Trips) have search + filters in the table; BUG-3 found and fixed. tables.mjs all pass. Next: batch 2 (hand-written tables). |
| 26 Nov 2026 | claude | V3-8 batch 2a merged (Warehouse expenses, Goods transfers) + V3-1d even sidebar spacing. Your request → V3-10 planned: Management pages on live data; several report figures are not recorded yet (credit notes, advances, client terms, opening cash, transfers), so decisions are needed. |
| 26 Nov 2026 | claude | V3-10 step 1a merged: Management Overview data from the dashboards builders (tests prove the same numbers as Live dashboards). Handed over at a clean point (long session); the next step is written in plans/V3-10.md. |
| 26 Nov 2026 | claude | V3-10 step 1b merged: Management → Overview is our own page on live data (same builders as Live dashboards), with warehouse and period filters. |
| 26 Nov 2026 | claude | Your note → V3-11 planned (Live dashboards like the reports; Fleet fits the screen with scrolling sections). V3-10 step 2 (Plans and orders) started. |
| 26 Nov 2026 | claude | V3-10 step 2 merged: Management → Plans and orders on live data (= the planned-vs-actual report). |
| 26 Nov 2026 | claude | V3-11a merged: Home has no blurb on My dashboards, the filter row sits at the right of the greeting, scrollbars in the brand colour. |
| 26 Nov 2026 | claude | V3-11b merged (no "(read-only)" on Home). V3-10 step 3 merged: Management → Sales and clients on live data (= the Today view's sales and owed figures). |
| 26 Nov 2026 | claude | V3-10 step 3b merged: Management → Warehouse performance on live data. Next: V3-11 Fleet (your order). |
| 26 Nov 2026 | claude | V3-11 LD-1 merged: Fleet fits the screen with scrolling sections. Usage limit reached: handed over (next steps in plans/V3-10.md and V3-11.md). |
| 26 Nov 2026 | cursor | V3-11 taken over: narrow Fleet card headers, then the border heatmap labels. |
| 26 Nov 2026 | cursor | V3-11 Fleet headers and heatmap labels merged. Next: report layout on the other Live dashboard tabs (plan Handover). |
| 26 Nov 2026 | cursor | V3-11 report layout started (filter bar, KPI cards, paired grid on the other tabs). |
| 26 Nov 2026 | cursor | V3-11 LD-2 / LD-3 merged: other Live dashboard tabs use the report layout. Row in review. |
| 26 Nov 2026 | cursor | V3-11 filter bar is two rows on every Live dashboard tab. Method text is off the charts. Merged into design-v3. |
| 26 Nov 2026 | cursor | V3-11: chart info icons and in-chart filters removed. My dashboards is Overview. Decisions uses the primary colour. New period plan is a modal, with Plan vs actual beside it. |
| 26 Nov 2026 | cursor | V3-11 Overview: filter bar has space between the rows, cards match Management and show the operational facts, all six decisions are colour-coded, export is an icon beside chart and table. Merged into design-v3. |
| 26 Nov 2026 | cursor | V3-11 filter bar is one row on every Live dashboard tab: a small title over each compact control. Merged into design-v3. |
| 26 Nov 2026 | cursor | V3-11 Overview Sales card: sparkline removed, comparison reads Past period. Merged into design-v3. |
| 26 Nov 2026 | cursor | V3-11 period plans: three-step create (company select in Group view, start month, length, calculated end date) and a Report action on each row. Merged into design-v3. |
| 26 Nov 2026 | cursor | V3-11 plan form: month and year dropdowns, overlap shown as soon as the period is chosen, status cards are a pale wash with a coloured icon. Rule added to AGENTS.md. |
| 26 Nov 2026 | cursor | V3-11 plan form: length is five equal boxes, and the overlap note is a pale wash with no left bar. |
| 26 Nov 2026 | cursor | V3-11 period plans: list matches purchase orders (search, filters, View beside Report), the detail page is one set of facts, and a new plan is a single smaller form. |
| 26 Nov 2026 | cursor | V3-11 period plans: View and Report stay put when the table scrolls. Copy to a new period is off the plan page. |
| 26 Nov 2026 | claude | Split agreed: cursor = V3-11 then V3-9; claude = V3-10 then V3-8 batch 2 (see "Who does what"). claude starts V3-10 Supplier balances. |
| 26 Nov 2026 | claude | V3-10 step 3c merged: Management → Supplier balances on live data (short loads; credit notes / advances not recorded yet). Request to cursor: ColumnsLine right-axis format. Next: Cash and closing. |
| 26 Nov 2026 | claude | V3-10 step 3d merged: Management → Cash and closing on live data. New rule (human): on Management pages the title and description come first, then the filter bar (applied to all six pages; `.cursor/rules/management-pages.mdc`). claude owns `screens/management/**`. |
| 26 Nov 2026 | claude | V3-10 step 3e merged: Management → Executive report on live data (rule-based sentences). All seven report pages are now in our code; the sample report only backs its hidden pages. |
| 26 Nov 2026 | claude | Your note → V3-12 planned: the missing Management figures will be written by Operations steps (sale, record payment, PO pro-forma / advance, credit note, banking takings), not report-only forms. Waiting for approval. |
| 26 Nov 2026 | claude | V3-1e merged: Live dashboards is in the Operations menu for everyone (tabs by role). Live dashboards tab review written under Requests for cursor (V3-11). V3-12 approved; step 0 (Settings and notifications) started. |
| 26 Nov 2026 | claude | V3-12 step 0 merged: Management → Settings (advance payments need director approval: off; each director's email / SMS for money news), migration 0013 applied on the shared DB. Also fixed redirects.test.ts for the V3-1e menu (missed because `pnpm test` stops at BUG-1). |
| 26 Nov 2026 | claude | V3-12 step 1 merged: clients are picked (or added) on the sale, web and phone, each with its own credit days; Sales → Clients tab; overdue everywhere uses the sale's own days; migration 0014 applied (existing sales → clients, figures unchanged). Shared stack restarted (Vite kept an old `packages/api/src/rules.ts` after the merge). BUG-4 logged. |
| 26 Nov 2026 | cursor | V3-11 period plans: the copy-lines menu floats over the dialog (Playwright: Escape closes the menu, Close closes the dialog). Four matching stat cards. Purchase order cards use the same wash and arrow. A truck may carry 3,500 cases (was 2,200 on an order and 2,000 on a new truck). |
| 26 Nov 2026 | cursor | V3-11 stat cards are plain. The colour sits on the bottom line only (Behind is orange, Running is green). |
| 26 Nov 2026 | cursor | V3-11 top bar uses the page background, so it sits flush with the rest of the screen. |
| 26 Nov 2026 | cursor | V3-11 period plans: the first stat reads Active plan. |
| 26 Nov 2026 | cursor | V3-11 top bar is a solid bar again. The menu control is a blue circle. |
| 26 Nov 2026 | claude | V3-12 step 2 merged: client payments. A sale records its first payment and how it was paid; Record payment on web Sales and the phone; Cash and closing counts money on the day it came in; Sales and clients shows money by how clients paid. Migration 0015 applied (existing paid amounts copied as payments dated at the sale). |
| 26 Nov 2026 | cursor | V3-11 Decisions keep a quiet colour on the word and icon. Stock cover is now What sold. The top bar is a rounded card with a scrollable trail. |
| 26 Nov 2026 | claude | V3-1f merged: one Home entry in Operations (the dashboard tabs keep it selected). V3-12 step 3 merged: supplier money on the PO page (pro-forma, advance, credit note, use of held money; approval per Settings; directors notified); Supplier balances reads it. Migration 0016 applied. |
| 26 Nov 2026 | cursor | V3-11 top bar is the breadcrumb only, with circular ends and a primary menu button. Hover text on that bar is white. BUG-4 fixed: New sale in Group view opens the form. |
| 26 Nov 2026 | cursor | V3-11 Overview: Shipments is the number still moving. A map shows five trucks. Money owed sits beside the top 5 products, with on time or days late instead of ageing bands. |
| 26 Nov 2026 | cursor | V3-11 Period plans and Purchase orders: the All plans bar is white, and the long explanation under it is gone. |
| 26 Nov 2026 | cursor | V3-11 Overview: four stats, a 2 by 2 of graphs (sales, money owed, most sold, trucks), then four stats. |
| 26 Nov 2026 | cursor | V3-11 Overview: the eight stats sit on the left, two rows of four, and the graphs sit beside them. |
| 26 Nov 2026 | cursor | V3-11 Overview: map under the stats, money owed is a pie at the bottom, purchase order and shipment status are charts. Trucks are colour coded. |
| 26 Nov 2026 | claude | V3-12 step 4 merged: Warehouse expenses → Cash (cash at start per receiving company and warehouse; cash sent to the company account, directors told); Cash and closing shows cash in hand. V3-12 complete: no Management figure says "Not recorded yet". Migration 0017 applied. Note: tables.mjs times out on Transport costs in demo mode (also on design-v3); it passes on the real API. |
| 26 Nov 2026 | cursor | V3-11 Overview: Plans, warehouse stock and trucks fill one row. Decisions sits beside sales. |
| 26 Nov 2026 | cursor | V3-11 Overview: purchase orders are coloured columns, shipments are a coloured ring. |
| 26 Nov 2026 | cursor | V3-11 Overview: the map fills its column, sales and profit is a box plot, and orange surfaces use white, blue and yellow. |
| 26 Nov 2026 | cursor | V3-11 Overview: sales is a pyramid, Decisions is a distinct blue, and Clear sits at the end of the centred filters. |
| 26 Nov 2026 | cursor | V3-11 Overview: sales is a share bar, Decisions is navy in light mode and blue in dark mode, and the filter Clear button is back to showing only when a filter is set. |
| 26 Nov 2026 | cursor | V3-11 Overview: revenue, cost of sales and profit are vertical bars, and decision marks follow urgency. |
| 26 Nov 2026 | cursor | V3-11 Overview: the revenue chart shows the actual amount under each bar. |
| 26 Nov 2026 | claude | V3-1g merged: System settings & logs (Users & access, Audit log, Settings) and Shipment map in the Operations sidebar. V3-8 batch 2b merged: Users, Audit log and Master data tables (Suppliers, Companies, Receiving companies, Drivers, Warehouses) on DataTable. Next: Truck desk tables. |
| 26 Nov 2026 | claude | Your note → V3-13 planned: one Settings & alerts workspace with a left menu; Alerts moves in. Waiting for approval. |
| 26 Nov 2026 | cursor | V3-11 Business: sales, profit and margin, prices below target, and landed cost per product. The longer study stays on Management. Trip cost per truck is on Fees. |
| 26 Nov 2026 | cursor | V3-11 Business graphs return in short cards: profit bridge, where each $100 went, sales and profit, expenses. Overview chart is expenses, sales and profit. |
| 26 Nov 2026 | cursor | V3-11 Business lead card is the expenses, sales and profit chart, matching the overview. The stat tiles are gone. |
| 26 Nov 2026 | claude | V3-13 merged: Settings & alerts workspace (left menu: Alerts, My notifications, Approvals, Exchange rates, Thresholds, Users & access, Audit log, Integrations). Alerts left the main sidebar; old addresses still open the right section. Management → Settings moved here. |
