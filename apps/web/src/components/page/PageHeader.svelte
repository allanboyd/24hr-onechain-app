<script lang="ts">
  // Page header for every page type (docs/17 §3 "Shared page layout" 1): overline, title, ONE plain line of description
  // (longer explanations go in the ⓘ popover), the primary action on the right (+ optional secondary), and on work pages
  // the "See the analysis →" link to the matching Home tab. On phones the actions drop under the title.
  import type { Snippet } from 'svelte';
  import InfoTip from './InfoTip.svelte';
  import AnalysisLink from './AnalysisLink.svelte';
  let { title, overline = '', description = '', info = '', analysis, analysisLabel, primary, secondary, children }: {
    title: string;
    /** section name above the title, e.g. "Logistics" */ overline?: string;
    /** one short sentence; no paragraphs */ description?: string;
    /** longer explanation shown in the ⓘ popover next to the description */ info?: string;
    /** Home tab key for "See the analysis →" (work pages) */ analysis?: string;
    analysisLabel?: string;
    /** the one primary action (e.g. <ActionInCompany> or a .btn-primary link) */ primary?: Snippet;
    /** secondary actions (e.g. "Map view", Export) shown before the primary */ secondary?: Snippet;
    /** extra line under the description (badges, freshness) */ children?: Snippet;
  } = $props();
</script>

<header class="ph">
  <div class="txt">
    {#if overline}<div class="overline">{overline}</div>{/if}
    <h1>{title}</h1>
    {#if description || info || analysis}
      <p class="desc">
        {#if description}<span class="d">{description}</span>{/if}
        {#if info}<InfoTip text={info} label="More about {title}" />{/if}
        {#if analysis}<span class="sep" aria-hidden="true"></span><AnalysisLink group={analysis} label={analysisLabel} />{/if}
      </p>
    {/if}
    {#if children}<div class="extra">{@render children()}</div>{/if}
  </div>
  {#if primary || secondary}
    <div class="acts">
      {#if secondary}{@render secondary()}{/if}
      {#if primary}{@render primary()}{/if}
    </div>
  {/if}
</header>

<style>
  .ph { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-3) var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-4); }
  .txt { min-width: 0; flex: 1 1 360px; display: flex; flex-direction: column; gap: 2px; }
  h1 { margin: 0; }
  .desc { display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--space-2); margin: 2px 0 0; font-size: var(--fs-body-sm); line-height: var(--lh-body-sm); color: var(--text-muted); }
  .d { min-width: 0; }
  .sep { width: 1px; height: 14px; background: var(--border-strong); margin: 0 var(--space-1); }
  .extra { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-top: var(--space-1); }
  .acts { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: flex-end; }
  @media (max-width: 600px) {
    h1 { font-size: var(--fs-h2); line-height: var(--lh-h2); }
    .txt { flex-basis: 100%; }
    .acts { justify-content: flex-start; width: 100%; }
    .sep { display: none; }
  }
</style>
