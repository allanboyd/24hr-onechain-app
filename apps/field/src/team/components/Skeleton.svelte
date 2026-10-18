<script lang="ts">
  // Loading placeholders shaped like the content: list rows or KPI cards.
  let { rows = 5, kind = 'list' }: { rows?: number; kind?: 'list' | 'kpis' | 'card' } = $props();
</script>
{#if kind === 'kpis'}
  <div class="kpis" aria-busy="true" aria-label="Loading">{#each Array(rows) as _}<div class="k"><span class="skeleton" style="width:60%"></span><span class="skeleton big"></span><span class="skeleton" style="width:40%"></span></div>{/each}</div>
{:else if kind === 'card'}
  <div class="k tall" aria-busy="true" aria-label="Loading"><span class="skeleton" style="width:40%"></span><span class="skeleton big"></span><span class="skeleton"></span><span class="skeleton" style="width:70%"></span></div>
{:else}
  <div class="list" aria-busy="true" aria-label="Loading">{#each Array(rows) as _}<div class="row"><span class="skeleton dot"></span><span class="lines"><span class="skeleton" style="width:55%"></span><span class="skeleton" style="width:80%"></span></span></div>{/each}</div>
{/if}
<style>
  .list { display: flex; flex-direction: column; gap: 10px; }
  .row, .k { background: var(--t-card); border: 1px solid var(--t-line); border-radius: var(--t-radius-sm); padding: 14px; display: flex; gap: 12px; align-items: center; }
  .k { flex-direction: column; align-items: stretch; gap: 10px; border-radius: var(--t-radius); }
  .k.tall { min-height: 160px; }
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .lines { flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .skeleton { display: block; height: 14px; border-radius: 7px; }
  .skeleton.big { height: 28px; width: 70%; }
  .skeleton.dot { width: 44px; height: 44px; border-radius: 14px; flex: none; }
</style>
