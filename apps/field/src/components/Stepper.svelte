<script lang="ts">
  // Quantity entry: big ± buttons for small fixes, the number field selects on focus for fast typing (e.g. 2000).
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';
  let { value = $bindable(0), min = 0, max = Infinity, step = 1, label = '', invalid = false }: { value?: number; min?: number; max?: number; step?: number; label?: string; invalid?: boolean } = $props();
  const set = (v: number) => (value = Math.min(max, Math.max(min, Math.round(v || 0))));
</script>
<div class="stepper" role="group" aria-label={label}>
  <button type="button" aria-label="Decrease {label}" onclick={() => set(value - step)} disabled={value <= min}><Minus size={22} /></button>
  <input type="number" inputmode="numeric" {min} {value} aria-invalid={invalid} aria-label={label}
    onfocus={(e) => e.currentTarget.select()} onchange={(e) => set(+e.currentTarget.value)} />
  <button type="button" aria-label="Increase {label}" onclick={() => set(value + step)} disabled={value >= max}><Plus size={22} /></button>
</div>
<style>
  .stepper { display: grid; grid-template-columns: 56px 1fr 56px; gap: var(--space-2); }
  button { height: 56px; border-radius: var(--radius-md); border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); display: grid; place-items: center; cursor: pointer; }
  button:disabled { opacity: .35; }
  input { height: 56px; min-width: 0; text-align: center; font: 700 22px var(--ff-body); font-variant-numeric: tabular-nums; border-radius: var(--radius-md); border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); }
  input[aria-invalid='true'] { border-color: var(--danger); outline: 1px solid var(--danger); }
</style>
