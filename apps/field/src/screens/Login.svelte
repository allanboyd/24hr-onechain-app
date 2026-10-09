<script lang="ts">
  // Two steps, Bolt-style: phone number → 4-digit PIN (MA-08; biometric unlock replaces the PIN in the native build).
  import type { User } from '@btw/api';
  import { haptic } from '../native';
  import { DEMO_PIN, ROLE_LABEL, fieldRole, fieldUsers, signIn } from '../lib';
  import { logoDark, logoLight } from '../brand';
  import Delete from '@lucide/svelte/icons/delete';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  let { onlogin }: { onlogin: (u: User) => void } = $props();
  let step = $state<'phone' | 'pin'>('phone');
  let phone = $state('');
  let pin = $state('');
  let error = $state('');
  let busy = $state(false);
  const demo = fieldUsers();
  function next(e?: Event) { e?.preventDefault(); error = ''; if (phone.replace(/\D/g, '').length < 9) { error = 'Enter your phone number'; return; } step = 'pin'; }
  async function key(d: string) {
    if (busy) return;
    haptic('tap'); error = '';
    pin = d === 'del' ? pin.slice(0, -1) : (pin + d).slice(0, 4);
    if (pin.length === 4) {
      busy = true;
      try { onlogin(await signIn(phone, pin)); } catch (e) { error = (e as Error).message; pin = ''; haptic('warning'); } finally { busy = false; }
    }
  }
</script>
<div class="wrap">
  <picture class="logo">
    {#if logoDark}<source srcset={logoDark} media="(prefers-color-scheme: dark)" />{/if}
    <img src={logoLight} alt="BTW Global Distributors" />
  </picture>
  {#if step === 'phone'}
    <form class="stack" onsubmit={next}>
      <h1>Sign in</h1>
      <label class="field"><span>Your phone number</span>
        <input class="input big" type="tel" inputmode="tel" autocomplete="tel" placeholder="+254 7xx xxx xxx" bind:value={phone} aria-invalid={!!error} /></label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-lg btn-block">Continue <ArrowRight size={20} /></button>
      <div class="demo">
        <div class="overline">Demo accounts · PIN {DEMO_PIN}</div>
        {#each demo as u (u.id)}
          {@const r = fieldRole(u)!}
          <button type="button" class="demo-row" onclick={() => { phone = u.phone; next(); }}><span class="grow"><strong>{u.name}</strong><br /><span class="caption">{ROLE_LABEL[r]}</span></span><span class="caption mono">{u.phone}</span></button>
        {/each}
      </div>
    </form>
  {:else}
    <div class="stack center">
      <h1>Enter your PIN</h1>
      <p class="muted">{phone} · <button class="link" onclick={() => { step = 'phone'; pin = ''; error = ''; }}>change</button></p>
      <div class="dots" aria-label="{pin.length} of 4 digits entered">{#each [0, 1, 2, 3] as i}<span class:on={i < pin.length}></span>{/each}</div>
      <p class="error" role="alert">{error}</p>
      <div class="pad">
        {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as d}
          {#if d === ''}<span></span>
          {:else}<button type="button" aria-label={d === 'del' ? 'Delete' : d} onclick={() => key(d)} disabled={busy}>{#if d === 'del'}<Delete size={26} />{:else}{d}{/if}</button>{/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
<style>
  .wrap { min-height: 100dvh; max-width: 440px; margin: 0 auto; padding: calc(env(safe-area-inset-top) + 32px) var(--space-5) calc(env(safe-area-inset-bottom) + 24px); display: flex; flex-direction: column; gap: var(--space-6); }
  .logo img { display: block; width: 200px; max-width: 70%; margin: 0 auto; border-radius: var(--radius-md); }
  .stack { display: flex; flex-direction: column; gap: var(--space-4); }
  .center { align-items: center; text-align: center; }
  h1 { font-size: var(--fs-h1); line-height: var(--lh-h1); }
  .input.big { height: 60px; font-size: 22px; font-variant-numeric: tabular-nums; }
  .error { color: var(--danger); min-height: 20px; margin: 0; font-weight: 600; }
  .demo { display: flex; flex-direction: column; gap: 2px; margin-top: var(--space-4); }
  .demo-row { display: flex; align-items: center; gap: var(--space-2); min-height: 52px; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); text-align: left; font: inherit; cursor: pointer; padding: 0 2px; }
  .grow { flex: 1; min-width: 0; }
  .link { border: 0; background: none; color: var(--link); font: 600 inherit; cursor: pointer; text-decoration: underline; }
  .dots { display: flex; gap: 18px; margin: var(--space-2) 0; }
  .dots span { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border-strong); }
  .dots span.on { background: var(--primary); border-color: var(--primary); }
  .pad { display: grid; grid-template-columns: repeat(3, 84px); gap: 14px; justify-content: center; }
  .pad button { width: 84px; height: 72px; border-radius: 18px; border: 0; background: var(--surface-sunken); color: var(--text); font: 600 28px var(--ff-body); display: grid; place-items: center; cursor: pointer; }
  .pad button:active { background: var(--primary-subtle); }
</style>
