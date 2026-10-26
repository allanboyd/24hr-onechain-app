<script lang="ts">
  // A set of single-choice filter chips for a FilterBar (e.g. Cash · Credit · Batch). Toggle buttons with aria-pressed;
  // the chosen chip is filled. `allowEmpty` lets a second click clear the choice.
  let { options, value = $bindable(''), label, allowEmpty = true, onchange }: {
    options: { value: string; label: string; n?: number | null }[];
    value?: string;
    /** accessible name, e.g. "Payment" */ label: string;
    allowEmpty?: boolean;
    onchange?: (v: string) => void;
  } = $props();
  function pick(v: string) { value = value === v && allowEmpty ? '' : v; onchange?.(value); }
</script>
<div class="chips" role="group" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" aria-pressed={value === o.value} onclick={() => pick(o.value)}>{o.label}{#if o.n !== undefined && o.n !== null}<span class="n">{o.n}</span>{/if}</button>
  {/each}
</div>
<style>
  .chips { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; }
  button { display: inline-flex; align-items: center; gap: 6px; height: var(--control-sm); padding: 0 var(--space-3); border-radius: var(--radius-full); border: 1px solid var(--border-strong);
    background: var(--surface); color: var(--text); font: 600 13px var(--ff-body); cursor: pointer; white-space: nowrap; }
  button:hover { background: var(--surface-sunken); }
  button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
  button[aria-pressed='true'] { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary); }
  .n { font-variant-numeric: tabular-nums; font-size: 12px; padding: 0 6px; border-radius: var(--radius-sm); background: var(--surface-sunken); color: var(--text-muted); }
  button[aria-pressed='true'] .n { background: transparent; color: inherit; }
</style>
