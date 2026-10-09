<script lang="ts">
  // Photo capture (MA-09/10): native camera when available (compressed by native.takePhoto), else the browser picker.
  import { isNative, takePhoto } from '../native';
  import Camera from '@lucide/svelte/icons/camera';
  import X from '@lucide/svelte/icons/x';
  let { names = $bindable([]), label = 'Add photo' }: { names?: string[]; label?: string } = $props();
  let thumbs = $state<{ name: string; url: string }[]>([]);
  let input: HTMLInputElement;
  const sync = () => (names = thumbs.map((t) => t.name));
  async function add() {
    const p = isNative ? await takePhoto() : null;
    if (p) { thumbs.push({ name: p.name, url: p.dataUrl }); sync(); } else input.click();
  }
  function picked(e: Event & { currentTarget: HTMLInputElement }) {
    for (const f of e.currentTarget.files ?? []) thumbs.push({ name: f.name, url: URL.createObjectURL(f) });
    e.currentTarget.value = ''; sync();
  }
  function remove(i: number) { thumbs.splice(i, 1); sync(); }
</script>
<div class="photos">
  {#each thumbs as t, i (t.url)}
    <div class="thumb"><img src={t.url} alt={t.name} /><button type="button" aria-label="Remove photo" onclick={() => remove(i)}><X size={14} /></button></div>
  {/each}
  <button type="button" class="add" onclick={add}><Camera size={22} /><span>{label}</span></button>
  <input bind:this={input} type="file" accept="image/*" capture="environment" multiple onchange={picked} hidden />
</div>
<style>
  .photos { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .thumb, .add { width: 76px; height: 76px; border-radius: var(--radius-md); overflow: hidden; position: relative; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .thumb button { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; border: 0; background: var(--surface); color: var(--text); display: grid; place-items: center; cursor: pointer; }
  .add { border: 1px dashed var(--border-strong); background: var(--surface-sunken); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; cursor: pointer; color: var(--text-muted); font: 600 11px var(--ff-body); padding: 4px; }
</style>
