<script lang="ts">
  // "What needs me" rows on a home: count, label with a status icon + word, one-line reason → the list behind it.
  // The tone is always shown as icon + word next to the count (never colour alone).
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Info from '@lucide/svelte/icons/info';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import type { ActionRow } from '../glance';
  let { rows, label }: { rows: ActionRow[]; label: string } = $props();
  const ICON = { danger: OctagonAlert, warning: TriangleAlert, success: CircleCheck, info: Info, neutral: CircleDashed };
  const WORD = { danger: 'Act now', warning: 'Check', success: 'OK', info: 'Info', neutral: '' } as const;
</script>
<div class="t-list" role="group" aria-label={label}>
  {#each rows as a (a.id)}
    {@const Icon = ICON[a.tone]}
    <a class="t-item ar" href="#{a.href}">
      <span class="n tone-{a.tone}">{a.value}</span>
      <span class="t-main">
        <span class="t-line1"><span class="t-ellipsis">{a.label}</span></span>
        <span class="st tone-{a.tone}"><Icon size={14} aria-hidden="true" />{WORD[a.tone]}</span>
        <span class="t-meta clamp">{a.text}</span>
      </span>
      <ChevronRight class="t-chev" size={20} />
    </a>
  {/each}
</div>
<style>
  .ar { min-height: 76px; }
  .n { flex: none; min-width: 48px; height: 48px; padding: 0 8px; border-radius: 14px; display: grid; place-items: center; font: 800 21px var(--ff-display); font-variant-numeric: tabular-nums; background: var(--surface-sunken); }
  .n.tone-danger, .st.tone-danger { background: var(--danger-subtle); color: var(--danger); } .n.tone-warning, .st.tone-warning { background: var(--warning-subtle); color: var(--warning); } .n.tone-success, .st.tone-success { background: var(--success-subtle); color: var(--success); }
  .st { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border-radius: 11px; font: 700 12px var(--ff-body); }
  .clamp { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
</style>
