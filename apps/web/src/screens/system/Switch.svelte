<script lang="ts">
  // An on / off switch (role="switch"), the same look across the settings workspace.
  let { on, label, disabled = false, onchange }: { on: boolean; label: string; disabled?: boolean; onchange: (v: boolean) => void } = $props();
</script>
<button type="button" class="sw" role="switch" aria-checked={on} aria-label={label} {disabled} onclick={() => onchange(!on)}><span class="knob"></span></button>
<style>
  .sw { position: relative; flex: none; width: 44px; height: 24px; border-radius: 99px; border: 0; padding: 0; cursor: pointer; background: var(--border-strong, var(--border)); transition: background var(--motion-fast) var(--motion-easing); }
  .knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--surface); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); transition: transform var(--motion-fast) var(--motion-easing); }
  .sw[aria-checked='true'] { background: var(--primary); }
  .sw[aria-checked='true'] .knob { transform: translateX(20px); }
  .sw:disabled { opacity: 0.55; cursor: not-allowed; }
  .sw:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
</style>
