<script lang="ts">
  // "Open in web app" for work that needs a big screen; opens the web route in the same company.
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { webLink } from '../web';
  let { path, label = 'Open in web app', primary = false }: { path: string; label?: string; primary?: boolean } = $props();
</script>
<a class="btn {primary ? 'btn-primary' : 'btn-secondary'} btn-lg wb" href={webLink(path)} target="_blank" rel="noopener"><ExternalLink size={18} />{label}</a>
<style>.wb { border-radius: 14px; text-decoration: none; }</style>
