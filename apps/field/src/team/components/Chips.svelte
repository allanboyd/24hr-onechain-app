<script lang="ts">
  // Filter chips, horizontally scrollable. Bindable value. Chosen chip = the shared selection look (base.css "Selection
  // states"): filled primary, tick, count pill filled; aria-pressed. When the options carry an "all" choice (id 'all' or
  // '') and another chip is on, a line under the chips says what is shown and offers "Show all" (docs/13).
  import X from '@lucide/svelte/icons/x';
  let { options, value = $bindable(), label = 'Filter', noun = 'items' }: { options: { id: string; label: string; count?: number }[]; value: string; label?: string; /** plural for the "Showing" line */ noun?: string } = $props();
  const all = $derived(options.find((o) => o.id === 'all' || o.id === ''));
  const cur = $derived(options.find((o) => o.id === value));
  const filtered = $derived(!!all && !!cur && cur.id !== all.id);
  // keep the chosen chip in view (a scrolled-away choice reads as "nothing chosen")
  function centerChosen(node: HTMLElement, _v: unknown) {
    const go = () => { const c = node.querySelector<HTMLElement>('[aria-pressed="true"]'); if (c) node.scrollLeft = Math.max(0, c.offsetLeft - (node.clientWidth - c.offsetWidth) / 2); };
    go(); return { update: go };
  }
</script>
<div class="chips" role="group" aria-label={label} use:centerChosen={value}>
  {#each options as o (o.id)}
    <button type="button" class="sel-ticked" aria-pressed={value === o.id} onclick={() => (value = value === o.id && all ? all.id : o.id)}>{o.label}{#if o.count != null}<span class="n">{o.count}</span>{/if}</button>
  {/each}
</div>
{#if filtered && cur && all}
  <p class="note" aria-live="polite"><span>Showing: <b>{cur.label}</b>{#if cur.count != null && all.count != null}{' '}({cur.count} of {all.count}){/if}</span>
    <button type="button" onclick={() => (value = all.id)}>Show all{#if all.count != null}{' '}({all.count}){/if}<X size={16} aria-hidden="true" /></button></p>
{/if}
<style>
  .chips { position: relative; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * var(--t-pad)); padding: 2px var(--t-pad); scroll-padding: var(--t-pad); }
  .chips::-webkit-scrollbar { display: none; }
  button { flex: none; height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--border-strong); background: var(--t-card); color: var(--text); font: 600 15px var(--ff-body); display: inline-flex; align-items: center; gap: 8px; cursor: pointer; white-space: nowrap; transition: background var(--motion-fast), transform var(--motion-fast); }
  button:active { transform: scale(.96); }
  button[aria-pressed='true'] { background: var(--sel-fill); color: var(--sel-on-fill); border-color: var(--sel-fill); font-weight: 700; }
  .n { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--surface-sunken); color: var(--text-muted); font: 700 12px/22px var(--ff-body); text-align: center; }
  [aria-pressed='true'] .n { background: color-mix(in srgb, var(--sel-on-fill) 22%, transparent); color: inherit; }
  .note { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0; padding: 4px 4px 4px 12px; border-radius: 12px; background: var(--sel-bg); box-shadow: inset 3px 0 0 var(--sel-line); font-size: 14px; color: var(--text); }
  .note b { color: var(--sel-ink); }
  .note button { height: 36px; padding: 0 10px; border: 0; background: none; color: var(--link); font: 600 14px var(--ff-body); gap: 4px; }
</style>
