<script lang="ts">import { toast } from './toast.svelte';</script>
{#if toast.msg}<div class="toast" role="status">{toast.msg}</div>{/if}
