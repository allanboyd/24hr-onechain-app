<script lang="ts">
  // Checkpoint-based tracking view used on web shipment detail and in the driver app.
  import { lookup, type Leg } from '@btw/api';
  import { fmtDateTime, hoursLabel } from './format';
  import Check from '@lucide/svelte/icons/check';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Shield from '@lucide/svelte/icons/shield';
  import Scale from '@lucide/svelte/icons/scale';
  import Warehouse from '@lucide/svelte/icons/warehouse';
  import Package from '@lucide/svelte/icons/package';
  let { leg, compact = false }: { leg: Leg; compact?: boolean } = $props();
  const icons = { border: Shield, weighbridge: Scale, warehouse: Warehouse, loading: Package, town: MapPin };
  const hereIdx = $derived(leg.passes.reduce((a, p, i) => (p.arrivedAt ? i : a), -1));
  const srcLabel: Record<string, string> = { driver: 'driver tap', geofence: 'auto (geofence)', 'gps-provider': 'GPS provider', sms: 'SMS', office: 'office' };
</script>
<ol class="timeline">
  {#each leg.passes as p, i (p.checkpointId)}
    {@const cp = lookup.checkpoint(p.checkpointId)!}
    {@const late = p.arrivedAt ? (Date.parse(p.arrivedAt) - Date.parse(p.plannedAt)) / 36e5 : 0}
    {@const Icon = icons[cp.kind]}
    <li class:done={!!p.departedAt || (p.arrivedAt && i < hereIdx)} class:here={i === hereIdx && !p.departedAt} class:late={i === hereIdx && !p.departedAt && late > 6}>
      <span class="dot">{#if p.departedAt}<Check size={14} strokeWidth={3} />{:else}<Icon size={12} strokeWidth={2.5} />{/if}</span>
      <div>
        <div style="font-weight:600">{cp.name}</div>
        {#if !compact || p.arrivedAt}
          <div class="caption">
            {#if p.arrivedAt}In {fmtDateTime(p.arrivedAt)}{#if p.departedAt} · Out {fmtDateTime(p.departedAt)}{/if} · {srcLabel[p.source ?? 'office']}
            {:else}Planned {fmtDateTime(p.plannedAt)}{/if}
          </div>
        {/if}
      </div>
      <div class="caption num">
        {#if p.arrivedAt && Math.abs(late) >= 1}<span class:accent-text={late > 0}>{late > 0 ? '+' : '−'}{hoursLabel(Math.abs(Math.round(late)))}</span>{/if}
      </div>
    </li>
  {/each}
</ol>
