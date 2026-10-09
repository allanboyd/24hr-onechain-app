<script lang="ts">
  import { toneOf, velocityGlyph, type Tone } from './status';
  let { status, tone, children }: { status?: string; tone?: Tone; children?: import('svelte').Snippet } = $props();
</script>
<span class="badge tone-{tone ?? toneOf(status ?? '')}" class:strike={status === 'Cancelled'}>
  {#if status && velocityGlyph[status]}<span aria-hidden="true">{velocityGlyph[status]}</span>{/if}
  {#if children}{@render children()}{:else}{status}{/if}
</span>
