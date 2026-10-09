<script lang="ts">
  // On-screen signature (PL-03, AK-03). Emits a PNG data URL; real build uploads it as a document.
  let { value = $bindable(''), height = 160 }: { value?: string; height?: number } = $props();
  let canvas: HTMLCanvasElement;
  let drawing = false;
  function ctx() { const c = canvas.getContext('2d')!; c.lineWidth = 2.5; c.lineCap = 'round'; c.strokeStyle = getComputedStyle(canvas).color; return c; }
  function pos(e: PointerEvent) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)]; }
  function down(e: PointerEvent) { drawing = true; canvas.setPointerCapture(e.pointerId); const c = ctx(); c.beginPath(); c.moveTo(...(pos(e) as [number, number])); }
  function move(e: PointerEvent) { if (!drawing) return; const c = ctx(); c.lineTo(...(pos(e) as [number, number])); c.stroke(); }
  function up() { if (!drawing) return; drawing = false; value = canvas.toDataURL('image/png'); }
  function clear() { canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height); value = ''; }
</script>
<div class="sig">
  <canvas bind:this={canvas} width="600" height={height * 2} style:height="{height}px" onpointerdown={down} onpointermove={move} onpointerup={up} onpointerleave={up} aria-label="Signature pad"></canvas>
  <div class="row between"><span class="caption">Sign inside the box</span><button type="button" class="btn btn-ghost btn-sm" onclick={clear}>Clear</button></div>
</div>
<style>
  canvas { width: 100%; touch-action: none; background: var(--surface-sunken); border: 1px dashed var(--border-strong); border-radius: var(--radius-md); color: var(--text); display: block; }
  .sig { display: flex; flex-direction: column; gap: var(--space-1); }
</style>
