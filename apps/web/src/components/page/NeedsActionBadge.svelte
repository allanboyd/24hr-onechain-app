<script lang="ts">
  // "3 need action" — icon + words on the warning / danger tint (never colour alone). Renders nothing for 0.
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import OctagonX from '@lucide/svelte/icons/octagon-x';
  let { n, label = 'need action', one = 'needs action', urgent = false }: {
    n: number | null | undefined;
    /** plural words after the number */ label?: string;
    /** singular words */ one?: string;
    /** danger tone (overdue, stopped) instead of warning */ urgent?: boolean;
  } = $props();
  const Icon = $derived(urgent ? OctagonX : TriangleAlert);
</script>
{#if n}<span class="badge {urgent ? 'tone-danger' : 'tone-warning'}"><Icon size={13} aria-hidden="true" />{n} {n === 1 ? one : label}</span>{/if}
