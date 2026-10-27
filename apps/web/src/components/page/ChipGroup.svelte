<script lang="ts">
  // A set of single-choice filter chips for a FilterBar (e.g. Cash · Credit · Batch). Toggle buttons with aria-pressed,
  // drawn with the shared .sel-chip (base.css "Selection states"): the chosen chip is filled and ticked, its count pill
  // too. `allowEmpty` lets a second click clear the choice.
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
    <button type="button" class="sel-chip" aria-pressed={value === o.value} onclick={() => pick(o.value)}>{o.label}{#if o.n !== undefined && o.n !== null}<span class="n">{o.n}</span>{/if}</button>
  {/each}
</div>
<style>
  .chips { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; }
</style>
