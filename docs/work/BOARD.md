# Work board

How to use it: [`AGENTS.md`](../../AGENTS.md). Each agent edits **only its own row**, plus lines under Requests and Log.

**Status:** ⬜ open · 📝 planned (waiting for approval) · 🔄 in progress · ⏸ handed over (read the plan's Handover section) · 👀 review · ✅ done · ⛔ blocked

## UI cleanup ([doc 22](../22-ui-cleanup.md))

| ID | Title | Status | Agent | Branch | Depends | Owns | Port |
|---|---|---|---|---|---|---|---|
| UI-0 | Foundation: tokens, `.select`, `Field`, `IconButton`, `Menu` ([plan](plans/UI-0.md)) | 📝 planned | claude | `ui/UI-0-foundation` | none | `docs/design-system/tokens.json`, `packages/tokens/**`, `packages/ui/src/**`, `scripts/build-tokens.mjs` | 5210 |
| UI-1 | Shell: sidebar + top bar (S-1…S-7) | ⬜ open | | | UI-0 | `apps/web/src/App.svelte`, `components/CompanySwitcher.svelte`, `components/CompanyMark.svelte`, `nav` in `routes.ts` | 5211 |
| UI-2 | Login, web + phone (L-1…L-3) | ⬜ open | | | UI-0 | `apps/web/src/screens/Login.svelte`, `apps/field/src/screens/Login.svelte` | 5212 |
| UI-3 | Forms (F-1, F-2, F-4…F-7) | ⬜ open | | | UI-0 | `screens/PoEdit.svelte`, `PeriodPlanNew.svelte`, `PeriodCheck.svelte`, `SellingPrices.svelte`, `components/ProductPicker.svelte`, `ReplaceDialog.svelte`, `StaticDialog.svelte`, `components/*Tab.svelte` | 5213 |
| UI-4 | Lists + page header (T-1…T-5, P-1) | ⬜ open | | | UI-0 | `apps/web/src/components/page/**`, table cells in `POs`, `Shipments`, `MasterData`, `Stock`, `Sales` screens | 5214 |
| UI-5 | Dashboard cards (D-1…D-4) ([plan](plans/UI-5.md)) | 📝 planned | claude | `ui/UI-5-dashboard-cards` | none | `apps/web/src/components/dashboard/**`, `components/charts/**`, `screens/dash/**` | 5215 |
| UI-6 | Review + QA: mockup flows, review board | ⬜ open | | | each merge | `tools/mockups/**`, `tests/**` | 5216 |

Can start right away: **UI-0** and **UI-5**. UI-1…UI-4 start in parallel once UI-0 is `✅ done`.

## Decisions waiting for the human
See [doc 22 §5](../22-ui-cleanup.md#5-decisions-needed-from-you): fonts, accent, sidebar collapse, demo users on login.

## Bugs found
<!-- BUG-<n> · where · steps · screenshot · found by <agent> (gets its own row once triaged) -->

## Requests
<!-- "<from> → <owner>: what you need" ; the owner answers on the same line -->

## Log
| Date | Who | What |
|---|---|---|
| 25 Nov 2026 | claude | Research written (doc 22), board and agent rules set up. |
| 25 Nov 2026 | claude | Added tests / fix log / handover rules (AGENTS.md §5–6). Plans for UI-0 and UI-5 written, waiting for approval. |
