<script lang="ts">
  // Status chip: colour + icon + words, never colour alone (client rule; C-04). Tones: danger / warning / success / info / neutral.
  import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Info from '@lucide/svelte/icons/info';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import type { Tone } from '../glance';
  let { tone, label, big = false }: { tone: Tone; label: string; big?: boolean } = $props();
  const ICON = { danger: OctagonAlert, warning: TriangleAlert, success: CircleCheck, info: Info, neutral: CircleDashed };
  const Icon = $derived(ICON[tone]);
</script>
<span class="sc tone-{tone}" class:big><Icon size={big ? 16 : 14} aria-hidden="true" />{label}</span>
<style>
  .sc { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 9px; border-radius: 13px; font: 700 12px var(--ff-body); white-space: nowrap; flex: none; }
  .sc.big { height: 30px; padding: 0 11px; border-radius: 15px; font-size: 13px; }
  .tone-danger { background: var(--danger-subtle); color: var(--danger); }
  .tone-warning { background: var(--warning-subtle); color: var(--warning); }
  .tone-success { background: var(--success-subtle); color: var(--success); }
  .tone-info { background: var(--info-subtle, var(--surface-sunken)); color: var(--info, var(--text)); }
  .tone-neutral { background: var(--surface-sunken); color: var(--text-muted); }
</style>
