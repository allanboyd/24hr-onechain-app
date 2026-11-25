# UI-5 · Dashboard cards: header overlap, period select, empty chart

**Agent:** (unclaimed) · **Branch:** `ui/UI-5-dashboard-cards` · **Worktree:** `../btw-gd-UI-5` · **Port:** 5215
**Approved:** no   <!-- the human changes this to "yes" before any code -->

## Goal
Card titles on the directors' Home are always readable, chart periods match the KPIs, and every card header looks the same. Rules: `.cursor/rules/dashboards-home.mdc`.

## Issues
D-1, D-2, D-3, D-4 (doc 22 §2). Screenshot of the problem: `docs/work/research/ui-cleanup/btw-home.png`.

## What the research found
- **D-1 cause:** in `screens/dash/today/TodayCard.svelte` the title `h3` has `min-width: 0` but no `white-space` / `overflow` rule, while `.tools` is `flex: none`. On narrow cards (≈ 360–470 px in the 3-column row) the legend, the select, the chart|table toggle and Export take the width. The title shrinks below its text and spills under the info icons ("Decisions"), or wraps word by word ("Sales / and / profit").
- **D-2:** the "7 days" period is a native `<select class="select sm">` inside the header (`Today.svelte` ~line 234).
- **D-3 likely cause:** the chart's own range defaults to `'7'` (`Today.svelte` ~line 60), while the KPI strip uses the page period (Last 30 days). If the demo data has no sales in the last 7 days, the chart is flat at 0 with a 0–1 axis. This must be confirmed against the data (`res.daily`) before changing anything.

## Files I will touch
- `apps/web/src/screens/dash/today/TodayCard.svelte`: two-row header when narrow. Row 1: title (one line, ellipsis, full text in `title`) + info + recommendation icons, which never shrink. Row 2 (or right side when wide): the `actions` snippet, toggle, Export. Uses a container query on `.tc`.
- `apps/web/src/screens/dash/today/Today.svelte`: the chart period becomes a segmented control (7 d · 30 d · 90 d · Year, `.sel-seg` from doc 13). Its default follows the page period. KPI card anatomy made equal (D-4).
- `apps/web/src/components/dashboard/DashboardPanel.svelte`, `components/charts/ChartCard.svelte`: apply the same header rule so feature tabs match.
- Possibly `screens/dash/today/*` legend markup if the legend moves under the title.

## Steps
1. Before screenshots of Home at 1440, 1280 and 1024 px wide, light + dark, plus one feature tab (Sales).
2. D-3: log `res.daily` dates/values in the mock and the live API for Daniel (Group). Write down the cause in the Fix log before changing anything.
3. D-1: header layout fix in `TodayCard`, then the same rule in `DashboardPanel` / `ChartCard`.
4. D-2: segmented period control; default = page period.
5. D-4: KPI cards share one anatomy (label, value, delta, foot) with equal heights.
6. After screenshots; `pnpm reports:walk` (the Playwright walk of the charts); checks; report.

## Test plan
| Issue | How it is checked | Fails before? |
|---|---|---|
| D-1 | Playwright at 1024 / 1280 / 1440: for each card header, the `h3` box doesn't intersect the icon boxes and the title is on one line (add the check to `tests/reports/walk.mjs`: **request to UI-6**, or a local script until then) | yes |
| D-2 | Screenshot: no native select in card headers; keyboard can change the period | yes |
| D-3 | Chart total for the shown period = KPI sales for the same period (the numbers must match), checked in the walk | yes (chart 0 vs USD 45.5K) |
| D-4 | Screenshot: KPI cards are the same height and have the same parts | yes |
| No regressions | `pnpm check:text && pnpm check && pnpm test && pnpm build && pnpm size` (`dashboards.test.ts`, `metrics.test.ts`) | |

## Out of scope
New charts or metrics. Colours and tokens (UI-0). The page title / overline above the tabs (UI-4, P-1).

## Done when
- [ ] Each issue above is fixed, or moved with a reason, and has a Fix log row
- [ ] `pnpm check:text && pnpm check && pnpm test && pnpm build && pnpm size` pass
- [ ] Screenshots before/after (light + dark; 1024 / 1440) listed below

## Fix log
| Date | Issue | Cause | Change (files) | Test | Result |
|---|---|---|---|---|---|

## Screenshots
| Screen | Before | After |
|---|---|---|
| Home (Daniel, Group) | `docs/work/research/ui-cleanup/btw-home.png` | |

## Handover
- **Last commit:**
- **Done:**
- **Half-done:**
- **Next step:**
- **Run first:**
- **Failing checks:**
- **Open questions:**

## Report
`UI-5: done … | blocked on … | left …`
