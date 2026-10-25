// Truck desk data for the team app (docs/10): the same pure functions as the web desk (@btw/api/trucks).
import { finance, loading, ref, shipments, type User } from '@btw/api';
import { deskKpis, sortDesk, truckDesk, type TruckRow } from '@btw/api/trucks';
import { can } from './access';
import { settle } from './load.svelte';
import type { Trip } from './insights';

export interface Desk { rows: TruckRow[]; trips: Trip[] | null; kpis: ReturnType<typeof deskKpis> }
export async function loadDesk(u: User): Promise<Desk> {
  const [waiting, ships, trips] = await Promise.all([loading.waiting(), shipments.list(), can(u, 'finance') || can(u, 'truck-expenses') ? settle(finance.trips(), null) : Promise.resolve(null)]);
  const r = ref();
  const rows = sortDesk(truckDesk({ trucks: r.trucks, providers: r.providers, drivers: r.drivers, waiting, shipments: ships, checkpoints: r.checkpoints, suppliers: r.suppliers, stopsOf: (id) => r.routes.find((x) => x.id === id)?.stops ?? [] }))
    .filter((x) => x.truck.active !== false || x.state !== 'Idle');
  return { rows, trips, kpis: deskKpis(rows, trips) };
}
