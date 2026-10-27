<script lang="ts" generics="K extends string">
  // Page-level tab bar — the ONE standard (Home-page style, base.css `.tabs`): plain text tabs with a thin bottom border,
  // muted text, the chosen tab in normal text colour with a 3 px coloured underline. Optional count after the label
  // (small muted number; a subtle filled pill on the chosen tab). Sits right under the page header, above the strip.
  // Buttons (role=tab, aria-selected) by default; with `hrefOf` links (aria-current=page) that `onselect` may intercept.
  let { tabs, value, label, onselect, hrefOf }: {
    tabs: readonly { key: K; label: string; n?: number | null }[];
    /** the chosen tab */ value: K;
    /** accessible name, e.g. "Truck desk" */ label: string;
    onselect?: (key: K) => void;
    /** render links (e.g. Home's routes); onselect, if given, replaces the navigation */ hrefOf?: (key: K) => string;
  } = $props();
</script>

{#if hrefOf}
  <nav class="tabs" aria-label={label}>
    {#each tabs as t (t.key)}<a href={hrefOf(t.key)} aria-current={t.key === value ? 'page' : undefined} onclick={onselect ? (e) => { e.preventDefault(); onselect(t.key); } : undefined}>{t.label}{#if t.n !== undefined && t.n !== null}<span class="n">{t.n}</span>{/if}</a>{/each}
  </nav>
{:else}
  <div class="tabs" role="tablist" aria-label={label}>
    {#each tabs as t (t.key)}<button type="button" role="tab" aria-selected={t.key === value} onclick={() => onselect?.(t.key)}>{t.label}{#if t.n !== undefined && t.n !== null}<span class="n">{t.n}</span>{/if}</button>{/each}
  </div>
{/if}
