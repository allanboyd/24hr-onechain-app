# 13 — Dashboard kit (workstream C, step 1)

The shared building blocks for the 56 dashboards in `docs/inspiration/Dashboards_by_Feature_Analyst_Led_Visualizations.docx`.
Plan: [`11-roles-and-dashboards-plan.md`](11-roles-and-dashboards-plan.md) §C · tracker: [`CHECKLIST.md`](CHECKLIST.md) C-01…C-04.

**See it:** run the web app (`pnpm dev:web`, or mock mode) and open **`#/dev/charts`** — the chart gallery. It renders every
component below with BTW sample data, in light and dark (button top right), with working exports. It only shows in dev and
demo builds (`showDemoHelpers`); in a production build the route says "not available".

**Import:** `import { DashboardPanel, DashboardGrid, Waterfall, … } from '../components/dashboard'`.
The existing `components/charts` barrel (ChartCard, BarChart, LineChart, Donut, Gauge, Heatmap, Meter, StatTile) is unchanged
and still used by today's screens.

## Rules the kit enforces (from the client's "shared visualization rules")
| Rule | How |
|---|---|
| Every chart has metric definition, unit/currency, date range, filters, freshness, drill-down | `DashboardPanel` props `definition`, `unit`, `period`, `filters` (snippet), `updatedAt`, `drill` |
| "No data yet", never a zero | Panel shows an explicit empty state when `rows()` has no data rows (or `empty`); KPI tiles with `value: null` read "No data yet"; stock cover keeps "no sales history" out of the counts |
| Status colours the same everywhere, never colour alone | `charts/status.ts`: `good` green (on track / paid), `warn` amber (at risk / part paid), `bad` red (delayed / short / damaged / unpaid), `none` grey (no data / not started). Each has an icon, a text glyph (✓ ! ✕ –) and a label. `StatusBadge` = icon + word |
| KPI tile = figure + change vs previous period + mini trend; tap → drill-down | `KpiScorecard` |
| Mobile: one chart per screen width | `DashboardGrid` collapses to one column under 900 px; charts wrap long labels onto two lines below 560 px |
| Export PDF / Excel / CSV | Export menu in every panel header (below) |
| Line = trend, bars = comparison, stacked only when totals matter, tables for exact values | Every panel has **View data** (the same rows as a table) |

## Components — when to use which

| Business question (client doc) | Component | Key props |
|---|---|---|
| 1. Where does the business stand today? (Directors' home) | `KpiScorecard` + `ExceptionList` | `items: Kpi[]` — `{ label, value: number \| null, format, change: { value, kind: 'pct' \| 'pp' \| 'abs', upIsGood, label }, trend, note, status, href \| onclick }`. Exceptions: `{ id, severity: 'critical' \| 'high' \| 'medium' \| 'low', title, detail, owner, due, status, href \| onclick }`, `max`, `moreHref` |
| 2. How do sales become profit? | `Waterfall` | `steps: { label, value?, kind?: 'total' \| 'subtotal' \| 'step' }[]` (first/last default to totals; totals without a value use the running total), `format` (put the currency here), `onselect(step)` |
| 3. What makes up landed cost per product? | `StackedBarH` | `categories`, `parts: { name, values, slot? }[]`, `format`, `shareLabels`, `totals`, `onselect(category, part)` |
| 4. Which products are slow and overstocked? | `QuadrantScatter` | `points: { label, x, y, size?, group? }[]`, `xLabel`, `yLabel`, `xThreshold`, `yThreshold`, `quadrants: { topLeft…bottomRight: { label, status? } }`, `groups` (fixed colour order), `formatX/Y`, `onselect(point)` |
| 5. Where do trucks wait? (route × stop) | `Heatmap` (existing) | put the trip count in `text` so small samples are visible |
| 6. How many orders at each stage? | `StageBars` | `stages: { label, count, value? }[]`, `formatValue`, `countLabel`, `onselect(stage)` — drop-off % between stages |
| 7. Ordered vs loaded vs delivered | `GroupedBars` + `GapTable` | `categories`, `series: { name, values }[]`, `tolerance` (default 0.5 %), `unit`, `format`; `GapTable` adds absolute and % gap per step + status chip |
| 8. Which causes drive delivery losses? | `Pareto` | `items: { label, value }[]`, `threshold` (default 0.8), `valueLabel`, `onselect`. Right axis is linked (100 % = total), not an independent scale. `paretoRows()` gives the same numbers for tables |
| 9. Which products risk stock-out or are slow? | `StockCoverBars` (per product) + `StockCoverBands` (distribution) | Bars: `items: { label, days: number \| null, min, max? }[]` → ✕ below minimum, ! above slow limit, ✓ within target, – no data. Bands: `days[]`, `bands` (default ≤ 7, 8–14, 15–21, 22–28, 29–60, > 60), `onselect(band)` |
| 10. Largest expense categories | `BarChart horizontal` (existing) | — |
| 11. Who owes what, and how old is it? | `AgeingBars` | `entities`, `bands: { name, values }[]` youngest → oldest, `tones?: Status[]` (else one-hue ramp), `format`, `onselect(entity, band)` |
| 12. Which alerts first? | `TriageMatrix` + `ExceptionList` | `rows` (impact, high first), `cols` (severity, low first), `counts[][]`, `action?(r, c)`, `selected`, `onselect(cell \| null)` — filters the list beneath |
| Live fleet board | `KanbanBoard` | `columns: { key, label, status? }[]`, `cards: { id, column, title, group?, subtitle?, meta?, status?, statusLabel?, stale? }[]`, `oncard` |
| Hours to dispatch / transit spread | `BoxPlot` | `groups: { label, values }[]` (n shown in labels), `unit`, `target`, `onselect(group)` |
| Mini trend anywhere | `TrendLine` | `values: (number \| null)[]`, `label?` |

Plotly-based (lazy Plotly chunk): Waterfall, QuadrantScatter, Pareto, StackedBarH, StageBars, GroupedBars, AgeingBars, StockCoverBars, BoxPlot.
Plain Svelte (no Plotly): KpiScorecard, ExceptionList, TrendLine, GapTable, StockCoverBands, TriageMatrix, KanbanBoard, StatusBadge.
All have `label` / `aria-label`s, keyboard-reachable click targets and a table view through the panel.

## Dashboard frame

```svelte
<DashboardGrid cols={2}>
  <DashboardPanel title="Profit bridge" definition="Sales less goods cost, truck cost, …" unit="USD" period="1–25 Oct 2026"
    updatedAt={report.generatedAt} rows={() => [['Step', 'USD'], ...]} filterText="Company: BTW"
    drill={{ label: 'Open the performance report', href: '#/performance' }} loading={!report} error={w.error} onretry={w.retry}>
    {#snippet filters()}…scoped selects…{/snippet}
    <Waterfall label="Profit bridge" steps={steps} format={usd} />
  </DashboardPanel>
</DashboardGrid>
```

`DashboardPanel` props: `title`, `subtitle`, `definition` (ⓘ popover + exports), `owner`, `unit`, `period`, `updatedAt` +
`freshness: 'updated' | 'synced'` + `staleAfter` (minutes; amber "may be out of date" after it), `filters` snippet + `filterText`,
`drill`, `loading`, `error` + `onretry`, `empty` / `emptyText` / `emptyHint`, `rows`, `filename`, `span` (1, 2, 3, `'full'`),
`exports` (default all three), `actions` snippet. `DashboardGrid`: `cols` 1–3.

## Exports
| Format | What's in it | How |
|---|---|---|
| CSV | the `rows()` table only | existing `downloadCsv` (in the entry, tiny) |
| Excel (.xlsx) | title, subtitle, definition, unit, period, filters, freshness, exported-at; blank row; bold frozen header with auto-filter; numbers stay numeric (`#,##0` / `#,##0.00`) | `dashboard/export/xlsx.ts` — hand-written SpreadsheetML + stored zip, **no dependency**, lazy chunk ≈ 2.7 KB gz. Checked with openpyxl |
| PDF | A4 landscape: same header lines, the panel's chart(s) as images, then the table (paged, header repeated, page numbers) | `dashboard/export/pdf.ts` — hand-written PDF (Helvetica, WinAnsi), **no dependency**, lazy chunk ≈ 2.8 KB gz. Charts come from `charts/snapshot.ts` (lazy): each Plotly chart is re-rendered **in the light theme on white** with `Plotly.toImage`, even when the user is in dark mode. HTML components (Kanban, triage, bands, KPI tiles) export as their table |

Files are named `<filename>-YYYY-MM-DD.<ext>`.

## Bundle
Web entry: +0.2 KB gz from this work (the gallery route line and the chart-image registry in `PlotlyChart`). Everything else is
in lazy chunks (gallery ≈ 28 KB gz incl. all components, xlsx ≈ 2.7 KB, pdf ≈ 2.8 KB, snapshot < 1 KB; Plotly unchanged).

## Page kit (docs/17 Phase 1, step 4)
Shared building blocks for the page layout in docs/17 §3: **header → summary strip → filters → list → detail drawer**.
Files: `apps/web/src/components/page/` (import from `../components/page`). Screens only — never import it from `App.svelte`
or other entry code, so it stays out of the entry bundle. Gallery: **`#/dev/page-kit`** (dev and demo builds only,
`showDemoHelpers`): a mock Shipments work page, the Group-view company picker, a money strip with a "no data yet" tile.

### Which page type gets what (docs/17 §3)
| Page type | Use | Don't use |
|---|---|---|
| **Work** (POs, Shipments, Sales, Re-exports, Warehouse expenses, Selling prices, Transport costs, Period plans) | `PageHeader` with `analysis="<home tab>"` + one `primary` action (`ActionInCompany`), `SummaryStrip` (≤ 4 counts that filter the list), `FilterBar`, table / phone cards, `DetailDrawer` or the detail page. Open filtered to "needs action" when there is any. | charts, an Overview tab, paragraphs of explanation |
| **Analysis** (Home tabs, Performance) | `PageHeader` (no strip), then the dashboard kit above (`DashboardPanel`, KPI row) | `SummaryStrip` |
| **Monitoring** (Truck desk board, map view) | `PageHeader`, status counts (`SummaryStrip`, tiles may be `filter: false`), the live board / map | — |
| **Record / settings** (PO page, Master data, Users, Audit) | `PageHeader` with the record's actions | strip, analysis link |

### Components
| Component | Props | Notes |
|---|---|---|
| `PageHeader` | `title`, `overline?`, `description?` (one line), `info?` (ⓘ popover text), `analysis?` (Home tab key → "See the analysis → Home · Fleet"), `analysisLabel?`; snippets `primary`, `secondary`, `children` (extra line) | Actions sit right of the title; under it on phones. Replaces the `.page-head` markup. |
| `SummaryStrip` | `tiles: SummaryTile[]` (2–4; extras dropped), `bind:value` (active key), `param = 'show'`, `sync = true`, `label`, `onchange?` | Each tile is a toggle button (`aria-pressed`, check mark + border when on). Clicking writes `?show=<key>` to the hash query; again clears it. 2×2 on phones. ~72 px high. |
| `SummaryTile` | `key`, `label`, `value: number \| string \| null`, `format?`, `sub?`, `status?` (good/warn/bad/none or a business word), `statusLabel?`, `filter?: false`, `info?` | `null` → "—" + "No data yet". Status always shows icon + word (charts/status.ts). |
| `FilterBar` | `bind:search?` (omit = no search box), `placeholder`, `active` (filters on), `onclear`, snippets `children` (selects as `<label class="field"><span>Route</span><select class="select">`), `end` (result count) | "Clear filters" appears when anything is on. Phones: search + "Filters (n)" button that opens the rest. |
| `ChipGroup` | `options [{value,label,n?}]`, `bind:value`, `label`, `allowEmpty = true` | single-choice chips for a FilterBar |
| `ActionInCompany` | `label`, `href?` or `onclick?(entityId)`, `intent?`, `feature?`, `when = true`, `what?`, `variant`, `size`, `icon`, `cue`, `user?` | Replaces RecordFor's "Choose a company to record …" rows (F6). One company: acts at once. Group view: "Which company?" menu listing only `allowedIds(user)`; picking calls `setCompany` and goes to `href?co=XXX`, or (with `intent`) back to the page with `?do=<intent>` so the remounted screen opens its dialog via `takeIntent(intent)`. One allowed company → switches without asking. Hidden when `feature` isn't granted or `when` is false (read-only users). |
| `DetailDrawer` | `bind:open`, `title`, `subtitle?`, `width = 480`, `onclose?`, snippets `header`, `footer`, children | Modal `<dialog>`: right drawer on desktop, full-screen sheet on phones; Esc / ✕ / backdrop close; focus stays inside and returns to the opener. |
| `WorkPage` | snippets `header`, `strip?`, `filters?`, children (the list), `drawer?` | order and spacing only |
| `AnalysisLink` | `group`, `label?` | "See the analysis → Home · <tab>" (`#/dashboards/<group>`) |
| `EmptyState` | `title`, `hint?`, `icon?`, `compact?`, children (actions) | e.g. "No shipments match these filters" + Clear filters |
| `NeedsActionBadge` | `n`, `label`, `one`, `urgent?` | icon + words; nothing for 0 |
| `InfoTip` | `text`, `title?`, `label`, `align` | the ⓘ popover used by the header and tiles |

### Filters in the address (`query.svelte.ts`)
`queryFilters({ show: '', route: '', q: '' })` returns `{ values, set, toggle, clear, count }` backed by the hash query, so a
filtered list can be bookmarked and Home cards can deep-link (`#/shipments?show=delayed`). It writes with
`history.replaceState` — **no `hashchange`**, so the screen is not remounted, refetched or scrolled (App.svelte keys the
screen on the full path). Read with `readQuery` / `queryFilters`, not `router.query` (that keeps the path the screen opened
with). Reserved keys: `co` (company), `tab`, `do` (ActionInCompany intent) — a dev warning fires if a page uses them.

### Bundle
Web entry: one lazy route line (`/dev/page-kit`). The kit and gallery are one lazy chunk ≈ 11.8 KB gz JS + 2.9 KB gz CSS.
