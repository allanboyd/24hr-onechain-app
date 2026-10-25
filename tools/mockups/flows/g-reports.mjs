// Reports & planning: director's command view, every report tab, and the Period plan / check.
import { open, shot, finish } from '../snap.mjs';
const out = process.argv[2];
const settle = (s, ms = 3500) => s.page.waitForTimeout(ms); // Plotly loads lazily on first chart

let s = await open({ app: 'web', user: 'u-daniel', outDir: out });
await settle(s, 4500);
await shot(s, 'G01-web-command-view', 'Dashboard — director command view', 'KPI tiles with deltas (sales, cases, margin, on-time, receivables, stock), what needs attention, quarter pace, sales vs last year, orders to place before stock runs out, on-time and receivables trends, movers (§10 executive, §9.3).');
const tabs = [
  ['sales', 'G02-web-report-sales', 'Reports · Sales', 'Revenue vs same period last year, by brand / warehouse (click to filter), sales type, receivables ageing, top customers; View data + CSV on every chart (§10 sales).'],
  ['quarterly', 'G03-web-report-quarterly', 'Reports · Quarterly review', 'Quarter picker, KPIs vs previous quarter and last year (pts for rates), generated highlights, scorecard, warehouses and brands; print/save as PDF and CSV.'],
  ['logistics', 'G04-web-report-logistics', 'Reports · Logistics', 'On-time trend, transit per lane (median/P80), border dwell vs plan, delays by cause, truck use, drivers (§10 logistics, TR-04).'],
  ['inventory', 'G05-web-report-inventory', 'Reports · Inventory', 'Stock value at landing cost, in-transit value, stock age (FIFO), status mix, days of cover; rows open the filtered stock list (§7.5, §9).'],
  ['planning', 'G06-web-report-planning', 'Reports · Planning', 'Seasonal forecast per brand × warehouse, stock-out dates, suggested orders with order-by dates from lane lead time; planners create draft plans in one click.'],
  ['finance', 'G07-web-report-finance', 'Reports · Finance', 'Landing cost per case trend and by lane, cost mix, gross margin by brand, transport agreed vs paid by provider (§17.6, FN-01..04).'],
];
for (const [r, id, title, notes] of tabs) { await s.go(`/reports?r=${r}`, 600); await settle(s); await shot(s, id, title, notes); }
await s.go('/reports?r=period&mode=plan', 600); await settle(s);
await shot(s, 'G08-web-period-plan', 'Period · plan the next 60 days', 'Demand forecast, stock at start, arrivals, plans already made → the gap in trucks per supplier lane with order-by dates and the budget; "Create draft plan from this" for planners.');
await s.go('/reports?r=period&mode=check', 600); await settle(s);
await shot(s, 'G09-web-period-check', 'Period · check what was captured', 'Completeness score per area and every missing or inconsistent record (check-ins, acknowledgements, documents, prices, unsent POs, payments, sales gaps, ledger) with a Fix link.');
await finish(s);

s = await open({ app: 'web', user: 'u-daniel', theme: 'dark', outDir: out });
await settle(s, 4500);
await shot(s, 'G10-web-command-view-dark', 'Dashboard — dark mode', 'Same command view in dark theme; chart colours from the validated dark palette.');
await finish(s);
