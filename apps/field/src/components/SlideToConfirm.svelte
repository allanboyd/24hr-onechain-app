<script lang="ts">
  // Slide-to-confirm: the one primary action per screen (no accidental taps in a moving cab).
  // Drag the knob ≥ 85% of the track; keyboard: focus the knob and press Enter or Space.
  import ChevronsRight from '@lucide/svelte/icons/chevrons-right';
  import Check from '@lucide/svelte/icons/check';
  import { haptic } from '../native';
  let { label, onconfirm, disabled = false, tone = 'accent' }: { label: string; onconfirm: () => void; disabled?: boolean; tone?: 'accent' | 'primary' } = $props();
  let track: HTMLDivElement;
  let x = $state(0);
  let dragging = $state(false);
  let done = $state(false);
  let start = 0;
  const KNOB = 56;
  const max = () => (track?.clientWidth ?? 300) - KNOB - 8;
  function down(e: PointerEvent) { if (disabled || done) return; dragging = true; start = e.clientX - x; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function move(e: PointerEvent) { if (dragging) x = Math.min(max(), Math.max(0, e.clientX - start)); }
  function up() { if (!dragging) return; dragging = false; if (x >= max() * 0.85) confirm(); else x = 0; }
  function confirm() {
    x = max(); done = true; haptic('success'); onconfirm();
    setTimeout(() => { done = false; x = 0; }, 900);
  }
  function key(e: KeyboardEvent) { if ((e.key === 'Enter' || e.key === ' ') && !disabled && !done) { e.preventDefault(); confirm(); } }
</script>
<div class="track tone-{tone}" class:disabled bind:this={track} aria-disabled={disabled}>
  <span class="label" style:opacity={1 - x / Math.max(1, max())}>{label}</span>
  <button type="button" class="knob" class:dragging style:transform="translateX({x}px)" aria-label="Slide to confirm: {label}"
    {disabled} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onkeydown={key}>
    {#if done}<Check size={26} strokeWidth={3} />{:else}<ChevronsRight size={26} strokeWidth={2.5} />{/if}
  </button>
</div>
<style>
  .track { position: relative; flex: none; height: 64px; border-radius: 32px; background: var(--accent); color: var(--text-on-accent); display: flex; align-items: center; user-select: none; touch-action: none; overflow: hidden; }
  .track.tone-primary { background: var(--primary); color: var(--text-on-primary); }
  .track.disabled { opacity: .45; }
  .label { flex: 1; text-align: center; padding: 0 20px 0 72px; font: 700 17px/1.2 var(--ff-body); }
  .knob { position: absolute; left: 4px; top: 4px; width: 56px; height: 56px; border-radius: 50%; border: 0; background: var(--surface); color: var(--text); display: grid; place-items: center; cursor: grab; box-shadow: var(--elevation-2); transition: transform var(--motion-base) var(--motion-easing); }
  .knob.dragging { transition: none; cursor: grabbing; }
  .knob:focus-visible { outline: 3px solid var(--surface); outline-offset: 2px; }
</style>
