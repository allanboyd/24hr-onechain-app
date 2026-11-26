# Work board

How to use it: [`AGENTS.md`](../../AGENTS.md). Each agent edits **only its own row**, plus lines under Requests and Log.

**Status:** ⬜ open · 📝 planned (waiting for approval) · 🔄 in progress · ⏸ handed over (read the plan's Handover section) · 👀 review · ✅ done · ⛔ blocked

## Design v3
**Base branch: `design-v3`** (worktrees branch from it, PRs/merges go back into it). Plan: [doc 23](../23-design-v3.md). Rows need `Approved: yes` in their plan file.

| ID | Title | Status | Agent | Branch | Depends | Owns | Port |
|---|---|---|---|---|---|---|---|
| V3-0 | Look + tokens: centred content, cards, chips, buttons, tables, page header (folds in UI-0, UI-4 T-/P- issues) ([plan](plans/V3-0.md)) | 👀 review (merged into design-v3) | claude | `v3/V3-0-look` | none | `docs/design-system/tokens.json`, `packages/tokens/**`, `packages/ui/src/**`, `apps/web/src/components/page/**` | 5230 |
| V3-1 | Shell: Operations / Management switch, process-ordered menus, Performance + Selling prices commented out (folds in UI-1) ([plan](plans/V3-1.md)) | 👀 review (merged into design-v3) | claude | `v3/V3-1-shell` | V3-0 | `apps/web/src/App.svelte`, `apps/web/src/routes.ts`, `components/CompanySwitcher.svelte`, `components/CompanyMark.svelte`, `apps/web/src/lib/side.svelte.ts` (new) | 5231 |
| V3-1b | Shell polish: sidebar logo + company select, no group titles, animated switch, modern top bar, collapsible sidebar ([plan](plans/V3-1b.md)) | 👀 review (merged into design-v3) | claude | `v3/V3-1b-shell-polish` | V3-1 | same as V3-1 | 5231 |
| V3-1c | Small fix: Management menu spaced in groups like Operations (your 26 Nov note) | 👀 review (merged into design-v3) | claude | `v3/V3-1c-mgmt-spacing` | V3-1b | `routes.ts` (managementNav) | 5231 |
| V3-2 | Management room: the report as is, driven by our sidebar, sample-data banner ([plan](plans/V3-2.md)) | 👀 review (merged into design-v3) | claude | `v3/V3-2-management` | none (menu entries via V3-1) | `apps/web/public/management/**`, `apps/web/src/screens/management/**` | 5232 |
| V3-3 | Operations · Today: KPIs, pipeline with owners, act on these first, who handles what | ⬜ open | | `v3/V3-3-today` | V3-0, V3-1 | `apps/web/src/screens/ops/**` | 5233 |
| V3-4 | Operations pages look: POs, Truck desk, Shipments, transfers, Stock, expenses, Sales, Period plans, Admin pages, Alerts "What I receive" (folds in UI-3 forms) | ⬜ open | | `v3/V3-4-ops-pages` | V3-0 | `apps/web/src/screens/*.svelte` (not Login), `apps/web/src/components/**` except `page/**`, `dashboard/**`, `charts/**` | 5234 |
| V3-5 | PWA: web app installable, phone "new version ready", `/install` page with QR ([plan](plans/V3-5.md)) | 👀 review (merged into design-v3) | claude | `v3/V3-5-pwa` | none | `apps/web/public/manifest.webmanifest`, `apps/web/public/icons/**`, `apps/web/sw.template.js`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/pwa/**`, `apps/field/src/pwa/**`, `apps/field/sw.template.js`, `apps/field/vite.config.ts`, `apps/field/public/manifest.webmanifest` | 5235 |
| V3-6 | Phone app look (same steps) + login web and phone (folds in UI-2) | ⬜ open | | `v3/V3-6-phone` | V3-0 | `apps/field/src/**` except `pwa/**`, `apps/web/src/screens/Login.svelte` | 5236 / 5226 |
| V3-7 | Review + QA: mockup flows, e2e, review board, before/after gallery | ⬜ open | | `v3/V3-7-qa` | each merge | `tools/mockups/**`, `tests/**` | 5237 |
| V3-8 | Tables: modern table library with search + filters, 68 tables / 47 files ([plan](plans/V3-8.md)) | 🔄 in progress (TanStack, approved) | claude | `v3/V3-8-tables` | V3-0 | `apps/web/src/components/page/DataTable.svelte`, `datatable.ts`, then table markup per screen (coordinate with V3-4) | 5238 |
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
- **BUG-2** · `packages/api/test/metrics.test.ts`: "Group (Daniel) · needs attention: Inventory page 8 = stock report 9" fails on unchanged `design-v3`. The two pages count stock needing attention differently (probably also date-driven). Found by claude (V3-0).

## Requests
<!-- "<from> → <owner>: what you need" ; the owner answers on the same line -->
- V3-0 → V3-1: took one rule in `App.svelte` (centred `.content`, sidebar side tokens). V3-1 keeps it. ✅ done
- V3-2 → V3-1: added `/management` routes + a temporary Management nav group in `routes.ts` (+ `navOnly` on nav items). V3-1 moves it under the switch and can keep one report frame across Management pages. ✅ done in V3-1
- V3-2 → shared: `packages/api/test/redirects.test.ts` sidebar count now checks Operations (16) and Management (8) separately (doc 23).
- V3-1b → V3-7: updated `tools/mockups/flows/a-procurement.mjs` ("Open the menu") and `h-companies.mjs` (company listbox in the sidebar); please run them.
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
