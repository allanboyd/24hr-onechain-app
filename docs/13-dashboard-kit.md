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
| `SummaryStrip` | `tiles: SummaryTile[]` (2–4; extras dropped), `bind:value` (active key), `param = 'show'`, `sync = true`, `label`, `onchange?`; active-filter bar: `noun` (turns it on), `total?`, `shown?`, `allValue = ''`, `auto?` (needs-action default), `labels?` (names of non-tile values) | Each tile is a radio-card (`.sel-card`, `aria-pressed`, "✓ Showing" when on). Clicking writes `?show=<key>` to the hash query; clicking the active tile again goes back to `allValue`. With `noun`, the bar under it reads "Showing: Delayed (5 of 140) · Show all ✕" (or "Showing what needs action: …" on the page's default) and starts with an **All &lt;noun&gt;** chip that is selected when no tile filter is on. See *Selection states*. 2×2 on phones. |
| `SummaryTile` | `key`, `label`, `value: number \| string \| null`, `format?`, `sub?`, `status?` (good/warn/bad/none or a business word), `statusLabel?`, `filter?: false`, `info?` | `null` → "—" + "No data yet". Status always shows icon + word (charts/status.ts). |
| `FilterBar` | `bind:search?` (omit = no search box), `placeholder`, `active` (filters on), `onclear`, snippets `children` (selects as `<label class="field"><span>Route</span><select class="select">`), `end` (result count) | "Clear filters" appears when anything is on. Phones: search + "Filters (n)" button that opens the rest. |
| `ChipGroup` | `options [{value,label,n?}]`, `bind:value`, `label`, `allowEmpty = true` | single-choice chips for a FilterBar (`.sel-chip`: filled + tick when chosen) |
| `ActionInCompany` | `label`, `href?` or `onclick?(entityId)`, `intent?`, `feature?`, `when = true`, `what?`, `variant`, `size`, `icon`, `cue`, `user?` | Replaces RecordFor's "Choose a company to record …" rows (F6). One company: acts at once. Group view: "Which company?" menu listing only `allowedIds(user)`; picking calls `setCompany` and goes to `href?co=XXX`, or (with `intent`) back to the page with `?do=<intent>` so the remounted screen opens its dialog via `takeIntent(intent)`. One allowed company → switches without asking. Hidden when `feature` isn't granted or `when` is false (read-only users). |
| `DetailDrawer` | `bind:open`, `title`, `subtitle?`, `width = 480`, `onclose?`, snippets `header`, `footer`, children | Modal `<dialog>`: right drawer on desktop, full-screen sheet on phones; Esc / ✕ / backdrop close; focus stays inside and returns to the opener. |
| `WorkPage` | snippets `header`, `strip?`, `filters?`, children (the list), `drawer?` | order and spacing only |
| `AnalysisLink` | `group`, `label?` | "See the analysis → Home · <tab>" (`#/dashboards/<group>`) |
| `EmptyState` | `title`, `hint?`, `icon?`, `compact?`, children (actions) | e.g. "No shipments match these filters" + Clear filters |
| `NeedsActionBadge` | `n`, `label`, `one`, `urgent?` | icon + words; nothing for 0 |
| `InfoTip` | `text`, `title?`, `label`, `align` | the ⓘ popover used by the header and tiles |

### Selection states (27 Oct 2026)
Every *pick / filter / switch* control uses ONE selection language, defined once in `packages/ui/src/base.css` (web and
phone). The chosen state is read from ARIA — `aria-pressed` (toggles, filters), `aria-selected` (tabs), `aria-checked`
(radios), `aria-current` (links) — or `.on` / a checked `<input>` for label chips, so the look and what a screen reader
says can't drift apart. **Colour is never the only cue**: every chosen state also has a tick, a word ("Selected" /
"Showing") or a weight change. Tokens (`--sel-bg`, `--sel-line`, `--sel-ink`, `--sel-fill`, `--sel-on-fill`) map to
`--primary-subtle` / `--primary` / `--text-on-primary`, so light (navy) and dark (orange on navy) follow the theme.

| Variant | Class | Chosen | Not chosen | Used by |
|---|---|---|---|---|
| Radio-card / filter tile | `.sel-card` (+ `.sel-mark` ring, `.sel-title`, `.sel-tag`) | tinted (`--sel-bg`), 2 px primary border, filled ring with a tick, bold primary title, "✓ Selected" / "✓ Showing" pill | surface, muted text, empty ring; hover lifts (border, shadow, −1 px) | Plan / Check a period, every `SummaryStrip` tile, `StatTile` `active`, phone *choice* / *reason* cards (corner tick) |
| Tabs (the Home-page style, one standard) | `Tabs` component (web `components/page/Tabs.svelte`, phone `team/components/Tabs.svelte`) on the base `.tabs` class; children `button[role=tab]` or `a[aria-current]` | normal text colour + 3 px coloured underline (`--nav-indicator`); the count `.n` gets a subtle filled pill | muted text, no underline, count as a small muted number; plain text, thin bottom border on the row — no tint, no boxes | Home tabs, Truck desk, Transport costs, Performance sections, Master data, Users, Notifications; phone Orders and Truck desk sections |
| Chips / segmented | `.sel-chip`, `.sel-seg` (children), `.sel-ticked` for a phone's own chip | filled primary, white text, tick (`::before`), count pill tinted | outlined, normal text; hover tint | `ChipGroup`, the All chip of the active-filter bar, Today *Company / Warehouse*, Add-truck *Regular / Market*, adjust kinds, period kinds, Admin login kinds; phone `Chips`, `Segmented` (sliding filled thumb), glance chips, warehouse sheets, loading-point switch |
| Row that filters | `.sel-row` | tinted, 3 px primary bar on the left, semibold | normal row | Check a period *By area*, Truck desk Costs provider rows, stock-cover bands |

**Page order on every tabbed work page:** header (title, description, actions) → tabs → summary strip of the active tab →
filter bar → list. Nothing sits between the header and the tabs: a "N … waiting for your approval / action" notice is a
strip tile, not a banner (Transport costs: directors get **Waiting for your approval** — registry `feesAwaiting`, value =
trips with a payment waiting, sub = USD, *Act now* / *None waiting* — in place of *Over 14 days*, whose count moves to the
Open balance sub-line; people who can't approve keep Open balance · Over 14 days · Over 30 days · Price not recorded).

**Summary-strip filters (the "click a figure" pattern).** A tile filter is always visible and always reversible:
1. the active tile is a chosen radio-card with "✓ Showing" next to its figure;
2. with `noun`, a bar under the strip says **"Showing: Delayed (5 of 140)"** and offers **Show all ✕**;
3. the bar starts with an **All &lt;noun&gt; (n)** chip, which is the chosen one when no tile filter is on ("Showing all shipments · pick a figure above to see only those");
4. clicking the active tile again, the All chip or Show all goes back to everything (`allValue`; pages with a needs-action default use `'all'`, so the choice sticks in the address and the default does not come back on reload);
5. the list's own Show / Status select is bound to the same query key, so it always names the same filter (non-tile values are named through `labels`);
6. when the page opened on its needs-action default (docs/17 §7.2: Shipments → Delayed, Stock → Needs attention, Transport costs → over 30 days, else (approvers) waiting for approval, else over 14 days, Purchase orders → Awaiting approval / Not sent, Re-exports → Open, Selling prices → Missing / Below target) the bar says **"Showing what needs action: Delayed (5 of 140) · Show all"** until the person picks something.

Phone (`apps/field/src/team`): `Chips` and the glance chips use the same filled + tick chip; when a chip other than *All*
is on, a line under them says "Showing: Delayed (3 of 83) · Show all (83) ✕", tapping the chosen chip again returns to
All, and the chosen chip is scrolled into view.

### DataTable (30 Oct 2026)
`DataTable` (`components/page/DataTable.svelte`, columns typed by `Column<T>` from `page/datatable.ts`) is the one list
table on work pages: Shipments, Purchase orders, Transport costs → Fees and Trips, Stock, Sales. It replaces the
hand-written `<table>` + separate `<ul class="cards">` markup.

```svelte
<DataTable id="shipments" label="Shipments" noun="shipments" rows={list ? rows : null} {columns} rowKey={(s) => s.id}
  onrowclick={(s) => router.go(`/shipments/${s.id}`)} initialSort={{ key: 'eta', dir: 'asc' }} filename="shipments" onclear={clearAll} />
```

| Prop | Meaning |
|---|---|
| `rows` | the filtered rows (`null` = loading → skeleton rows; or pass `loading`) |
| `columns: Column<T>[]` | see below |
| `rowKey`, `onrowclick?`, `selected?` (key or test → `.sel-row` look), `rowClass?` | rows are focusable when clickable: ↑ ↓ Home End move, Enter opens; clicks on links / buttons inside a row don't open it |
| `initialSort?: {key, dir}`, `pageSize = 25` | "Showing 1–25 of 140 shipments", **Show 25 more**, ‹ Page 1 of 6 › (back to page 1 when the filter changes the count) |
| `density = 'comfortable'`, `id?` | Comfortable / Compact switch; with `id`, density and hidden columns are remembered per browser (`btw.table.<id>`) |
| `filename?` | **CSV** button: the filtered + sorted rows (all pages, visible columns) via `downloadCsv`, `<filename>-YYYY-MM-DD.csv` |
| `empty?` snippet, or `emptyTitle` / `emptyHint` / `onclear` | default "No &lt;noun&gt; match these filters · Clear filters" |
| `maxHeight?` | scroll inside the card with a sticky header (Fees: `70vh`) |
| `cardsBelow = 640` | below this **table width** each row is a card; `card?` snippet for a custom card, else title / aside / "label: value" lines / actions from the columns |
| `label`, `caption?`, `noun`, `tools = true`, `toolbar?`, `totalLabel` | aria-label, hidden caption, counts wording, the density/columns/CSV row |

`Column<T>`: `key`, `label`, `align` (`'right'` = tabular figures, sorts biggest first), `width`, `sortValue(row)` (numbers,
`ts(iso)` for dates — never the formatted text), `value(row)` (plain cell text, CSV and sort fallback), `csv(row) | false`,
`cell` (snippet taking the row — links, `Badge` / `StatusBadge` chips, captions), `sticky` (first column stays while the
table scrolls sideways), `hideBelow` (px of table width; the **Columns** menu can still show it), `hidden`, `hideable`,
`title` (header tooltip), `total(rows)` (totals row over all filtered rows), `mobile` (`'title' | 'aside' | 'actions' | false`),
`class`. Cell snippets are top-level snippets in the screen referenced from the `columns` `$derived` (snippets inside a
component's children aren't visible to the script).

Behaviour: headers are buttons with ▲/▼ and `aria-sort`; the table scrolls sideways inside its card with fade edges instead
of widening the page; numbers right-aligned with tabular digits; hover tint, no zebra. Lazy: it lives in the page-kit chunk
(≈ 11 KB gz JS incl. the kit), nothing in the entry.

### Filters in the address (`query.svelte.ts`)
`queryFilters({ show: '', route: '', q: '' })` returns `{ values, set, toggle, clear, count }` backed by the hash query, so a
filtered list can be bookmarked and Home cards can deep-link (`#/shipments?show=delayed`). It writes with
`history.replaceState` — **no `hashchange`**, so the screen is not remounted, refetched or scrolled (App.svelte keys the
screen on the full path). Read with `readQuery` / `queryFilters`, not `router.query` (that keeps the path the screen opened
with). Reserved keys: `co` (company), `tab`, `do` (ActionInCompany intent) — a dev warning fires if a page uses them.

### Bundle
Web entry: one lazy route line (`/dev/page-kit`). The kit and gallery are one lazy chunk ≈ 11.8 KB gz JS + 2.9 KB gz CSS.
