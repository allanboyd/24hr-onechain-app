<script lang="ts">
  // Loaders (Joel, Eric, Moses, SBL) and Testfie at GBI Mombasa — client §10 "today's loading list and dispatched today,
  // with no prices or payments" (C-P1-09). Two short lists; tap a row to see its products. Lazy chunk of the loader screen.
  import { loading, lookup, type GiverWork, type Loading } from '@btw/api';
  import { fmtTime } from '@btw/ui';
  import ChevronDown from '@lucide/svelte/icons/chevron-right';
  import Sheet from './Sheet.svelte';
  import CompanyDot from './CompanyDot.svelte';
  import { cases } from '../lib';
  let { lp, toLoad, onclose, page = false }: { lp: string; toLoad: GiverWork['toLoad']; onclose?: () => void; page?: boolean } = $props();

  let done = $state<(Loading & { poRef?: string })[] | null>(null);
  const TZ = 'Africa/Nairobi';
  const day = (d: string | number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));
  $effect(() => { const today = day(Date.now()); loading.list(lp).then((ls) => (done = ls.filter((l) => l.status === 'Loaded' && l.loadedAt && day(l.loadedAt) === today).sort((a, b) => Date.parse(b.loadedAt!) - Date.parse(a.loadedAt!)))).catch(() => (done = [])); });
  const pending = $derived(toLoad.filter((x) => x.loadingPointId === lp).sort((a, b) => a.poRef.localeCompare(b.poRef) || a.truckNo - b.truckNo));
  const qty = (l: Loading, k: 'orderedQty' | 'loadedQty') => l.lines.reduce((a, x) => a + x[k], 0);
  const name = (pid: string) => { const p = lookup.product(pid); return p ? `${p.brand} ${p.pack}` : pid; };
  let openId = $state<string | null>(null);
  const supplier = $derived(lookup.supplier(lp));
</script>

{#snippet body()}
  <section aria-labelledby="tl-h">
    <h3 class="h" id="tl-h">To load <span class="n">{pending.length}</span></h3>
    <ul class="list">
      {#each pending as l (l.id)}
        <li>
          <button aria-expanded={openId === l.id} onclick={() => (openId = openId === l.id ? null : l.id)}>
            <CompanyDot entityId={l.entityId} />
            <span class="grow"><strong>{l.poRef} · truck {l.truckNo}</strong><span class="caption">{cases(qty(l, 'orderedQty'))} · {l.lines.length} product{l.lines.length === 1 ? '' : 's'}</span></span>
            <span class="tag wait">To load</span><ChevronDown size={18} class={openId === l.id ? 'up' : ''} />
          </button>
          {#if openId === l.id}<ul class="lines">{#each l.lines as x (x.planLineId)}<li><span>{name(x.productId)}</span><b>{x.orderedQty}</b></li>{/each}</ul>{/if}
        </li>
      {:else}<li class="none">Nothing left to load today.</li>{/each}
    </ul>
  </section>
  <section aria-labelledby="dt-h">
    <h3 class="h" id="dt-h">Dispatched today <span class="n">{done?.length ?? '…'}</span></h3>
    <ul class="list">
      {#if !done}<li class="none">Loading…</li>{:else}
      {#each done as l (l.id)}
        <li>
          <button aria-expanded={openId === l.id} onclick={() => (openId = openId === l.id ? null : l.id)}>
            <CompanyDot entityId={l.entityId} />
            <span class="grow"><strong>{lookup.truck(l.truckId)?.reg ?? 'Truck'} · {fmtTime(l.loadedAt)}</strong><span class="caption">{cases(qty(l, 'loadedQty'))} · {lookup.driver(l.driverId)?.name ?? ''}{l.poRef ? ` · ${l.poRef}` : ''}</span></span>
            <span class="tag ok">Dispatched</span><ChevronDown size={18} class={openId === l.id ? 'up' : ''} />
          </button>
          {#if openId === l.id}<ul class="lines">{#each l.lines as x (x.planLineId + x.productId)}<li><span>{name(x.productId)}{x.alternativeFor ? ' (alternative)' : ''}</span><b>{x.loadedQty}</b></li>{/each}</ul>{/if}
        </li>
      {:else}<li class="none">No truck has left yet today.</li>{/each}
      {/if}
    </ul>
  </section>
{/snippet}
{#if page}
  <div class="page">
    <h1>Today at {supplier?.code ?? ''} {supplier?.city ?? ''}</h1>
    {@render body()}
  </div>
{:else}
  <Sheet modal title="Today at {supplier?.code ?? ''} {supplier?.city ?? ''}" {onclose}>{@render body()}</Sheet>
{/if}

<style>
  section { display: flex; flex-direction: column; gap: 6px; }
  .h { display: flex; align-items: center; gap: 8px; margin: 0; font: 700 13px var(--ff-display); text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
  .n { min-width: 24px; height: 24px; padding: 0 7px; border-radius: 12px; background: var(--surface-sunken); color: var(--text); font: 700 13px/24px var(--ff-body); text-align: center; letter-spacing: 0; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list > li { border-bottom: 1px solid var(--border); }
  .list button { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: 60px; border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; padding: 6px 0; }
  .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .tag { font: 700 12px var(--ff-body); padding: 3px 8px; border-radius: 10px; white-space: nowrap; }
  .tag.wait { background: var(--warning-subtle); color: var(--warning); } .tag.ok { background: var(--success-subtle); color: var(--success); }
  .list :global(svg) { transition: transform var(--motion-fast); } .list :global(.up) { transform: rotate(90deg); }
  .lines { list-style: none; margin: 0 0 10px; padding: 8px 12px; border-radius: var(--radius-md); background: var(--surface-sunken); display: flex; flex-direction: column; gap: 4px; }
  .lines li { display: flex; justify-content: space-between; gap: 12px; font-size: 15px; }
  .lines b { font-variant-numeric: tabular-nums; }
  .none { padding: 14px 0; color: var(--text-muted); border: 0 !important; }
  .page { padding: calc(env(safe-area-inset-top) + 20px) var(--space-5) calc(var(--field-nav, 68px) + 16px); max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-4); }
  .page h1 { font-size: var(--fs-h1); margin: 0; }
</style>
