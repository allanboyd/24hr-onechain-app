<script lang="ts">
  // V3-15 Truck desk · Board: trucks in four lanes by state (a small, consistent set: Waiting & loading, On the road,
  // Delayed, Arrived), each card flagging what needs doing (no driver, papers missing, no check-in, long wait, open issue).
  // "With map" stacks the lanes on the left and shows the trucks on the live map on the right (same screen, no tab switch).
  import { lookup, type Shipment } from '@btw/api';
  import { waitLabel, type TruckRow } from '@btw/api/trucks';
  import { Badge, fmtDateTime, hoursLabel } from '@btw/ui';
  import Progress from '../live/Progress.svelte';
  import { view as legView } from '../live/legs';
  let { rows, ships, withMap = false, onopen }: { rows: TruckRow[]; ships: Shipment[]; withMap?: boolean; onopen: (x: TruckRow) => void } = $props();

  const LANES = [
    { key: 'wait', label: 'Waiting & loading', states: ['Waiting', 'Loading'] },
    { key: 'road', label: 'On the road', states: ['In transit', 'At border'] },
    { key: 'late', label: 'Delayed', states: ['Delayed'] },
    { key: 'done', label: 'Arrived', states: ['Arrived'] },
  ] as const;
  const shipOf = (x: TruckRow) => (x.shipmentId ? ships.find((s) => s.id === x.shipmentId) : undefined);
  function flags(x: TruckRow) {
    const out: { text: string; tone: 'bad' | 'warn' }[] = [];
    const sh = shipOf(x); const v = sh ? legView(sh) : null;
    if (!x.driver) out.push({ text: 'No driver', tone: 'bad' });
    if (!(x.truck as { documents?: unknown[] }).documents?.length) out.push({ text: 'Papers missing', tone: 'warn' });
    if (v?.problem?.startsWith('No check-in')) out.push({ text: v.problem.split(':')[0], tone: 'bad' });
    if (x.issues.length) out.push({ text: x.issues[0].reason, tone: 'bad' });
    if (x.state === 'Waiting' && (x.waitingHours ?? 0) > 24) out.push({ text: `Waiting ${waitLabel(x.waitingHours)}`, tone: 'warn' });
    return out;
  }
  const lanes = $derived(LANES.map((l) => ({ ...l, items: rows.filter((x) => (l.states as readonly string[]).includes(x.state)) })));
  const idle = $derived(rows.filter((x) => x.state === 'Idle').length);
  let picked = $state<string | null>(null), hovered = $state<string | null>(null);
  const mapItems = $derived(ships.filter((s) => rows.some((x) => x.shipmentId === s.id)));
  function open(x: TruckRow) { picked = x.shipmentId ?? null; onopen(x); }
</script>

<div class="sb" class:withmap={withMap}>
  <div class="lanes">
    {#each lanes as l (l.key)}
      <section class="lane {l.key}" aria-label="{l.label}: {l.items.length} trucks">
        <h3><span>{l.label}</span><span class="n">{l.items.length}</span></h3>
        <div class="cards">
          {#each l.items as x (x.truck.id)}
            {@const sh = shipOf(x)}{@const v = sh ? legView(sh) : null}{@const fl = flags(x)}
            <button type="button" class="tc" class:sel={!!picked && picked === x.shipmentId} onclick={() => open(x)} onmouseenter={() => (hovered = x.shipmentId ?? null)} onmouseleave={() => (hovered = null)}>
              <div class="top"><strong>{x.truck.reg}</strong><span class="grow"></span>{#if x.state === 'At border'}<Badge tone="warning">At border</Badge>{:else if x.state === 'Loading'}<Badge tone="accent">Loading</Badge>{/if}</div>
              <div class="sub">{x.provider?.name ?? '-'} · {x.driver?.name ?? 'no driver'}</div>
              {#if v}<Progress {v} labels={false} />{/if}
              <div class="where">{x.where}{#if x.state === 'Waiting'} · waiting {waitLabel(x.waitingHours)}{/if}</div>
              {#if x.eta && (x.state === 'In transit' || x.state === 'At border' || x.state === 'Delayed')}<div class="eta" class:bad={x.eta.state === 'Late'}>ETA {fmtDateTime(x.eta.eta)}{x.eta.state !== 'On time' ? ` · ${x.eta.state.toLowerCase()} ${hoursLabel(x.eta.hours)}` : ''}</div>{/if}
              {#if fl.length}<div class="flags">{#each fl as f (f.text)}<span class="fl {f.tone}">{f.text}</span>{/each}</div>{/if}
            </button>
          {:else}<p class="none">None</p>{/each}
        </div>
      </section>
    {/each}
    {#if idle}<p class="idle caption">{idle} idle truck{idle === 1 ? '' : 's'} (no trip, not in a queue): see the Table.</p>{/if}
  </div>
  {#if withMap}
    <div class="map">{#await import('../live/LiveMap.svelte') then M}<M.default items={mapItems} selected={picked} hover={hovered} onselect={(id) => { picked = id; const x = rows.find((r) => r.shipmentId === id); if (x) onopen(x); }} />{/await}</div>
  {/if}
</div>

<style>
  .sb { display: block; }
  .lanes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start; }
  .lane { background: var(--surface-sunken); border-radius: 14px; padding: 10px; min-width: 0; }
  .lane h3 { display: flex; justify-content: space-between; align-items: center; margin: 2px 4px 10px; font-size: 13px; font-weight: 700; }
  .lane .n { font-size: 12px; padding: 1px 8px; border-radius: 99px; background: var(--surface); color: var(--text-muted); }
  .lane.late h3 { color: var(--danger); } .lane.late .n { background: var(--danger-subtle); color: var(--danger); }
  .lane.done h3 { color: var(--success); }
  .cards { display: flex; flex-direction: column; gap: 8px; max-height: calc(100vh - 340px); overflow-y: auto; padding: 1px; }
  .tc { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; transition: box-shadow .15s, border-color .15s; }
  .tc:hover { box-shadow: 0 2px 10px rgb(0 0 0 / .07); } .tc.sel { border-color: var(--primary); }
  .tc:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .top { display: flex; align-items: center; gap: 6px; } .top strong { font-size: 14.5px; } .grow { flex: 1; }
  .sub, .where, .eta { font-size: 12.5px; color: var(--text-muted); } .where { color: var(--text); }
  .eta.bad { color: var(--danger); font-weight: 600; }
  .flags { display: flex; flex-wrap: wrap; gap: 4px; }
  .fl { font-size: 11.5px; font-weight: 600; padding: 2px 7px; border-radius: 99px; }
  .fl.bad { background: var(--danger-subtle); color: var(--danger); } .fl.warn { background: var(--warning-subtle, var(--surface)); color: var(--warning); }
  .none { margin: 6px 4px; font-size: 12.5px; color: var(--text-subtle); }
  .idle { grid-column: 1 / -1; margin: 0; }
  .withmap { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 14px; height: calc(100vh - 260px); min-height: 520px; }
  .withmap .lanes { grid-template-columns: minmax(0, 1fr); overflow-y: auto; align-content: start; padding-right: 4px; }
  .withmap .cards { max-height: none; overflow: visible; }
  .map { border-radius: 14px; overflow: hidden; border: 1px solid var(--border); min-height: 0; }
  @media (max-width: 1200px) { .lanes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 1000px) { .withmap { grid-template-columns: minmax(0, 1fr); height: auto; } .map { height: 60vh; } }
  @media (max-width: 640px) { .lanes { grid-template-columns: minmax(0, 1fr); } .cards { max-height: none; } }
</style>
