<script lang="ts">
  import type { User } from '@btw/api';
  import { WEB_URL } from '../lib';
  let { user, onlogout }: { user: User; onlogout: () => void } = $props();
</script>
<div class="wrap">
  <h1>Use the web app</h1>
  <p class="muted">Hi {user.name.split(' ')[0]}. This phone app is only for drivers, loading points and receivers. Planning, approvals, stock and reports are in the web app — it works on phones too.</p>
  <a class="btn btn-primary btn-lg btn-block" href={WEB_URL}>Open {WEB_URL.replace(/^https?:\/\//, '')}</a>
  <button class="btn btn-secondary btn-block" onclick={onlogout}>Sign out</button>
</div>
<style>
  .wrap { min-height: 100dvh; max-width: 440px; margin: 0 auto; padding: calc(env(safe-area-inset-top) + 64px) var(--space-5) var(--space-6); display: flex; flex-direction: column; gap: var(--space-4); }
  h1 { font-size: var(--fs-h1); line-height: var(--lh-h1); }
</style>
