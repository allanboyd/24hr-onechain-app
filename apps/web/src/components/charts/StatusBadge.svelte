<script lang="ts">
  // Status chip: icon + label on the status tint (C-04). Never colour alone.
  import { statusMeta, type Status } from './status';
  let { status, label, size = 14 }: { status: Status | string; /** overrides the default word, e.g. "Unpaid" */ label?: string; size?: number } = $props();
  const m = $derived(statusMeta(status, label));
  const Icon = $derived(m.icon);
</script>
<span class="badge tone-{m.tone} sb"><Icon size={size} aria-hidden="true" />{m.label}</span>
<style>.sb :global(svg) { flex: none; }</style>
