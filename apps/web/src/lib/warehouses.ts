// Warehouse management (doc 08 §3): add / edit / deactivate destination warehouses (Country – Town).
// Uses the API's masterdata warehouse functions when they exist; until then edits stay in this browser session.
import { lookup, masterdata, ref, type ID, type Warehouse } from '@btw/api';

export interface WarehouseInput {
  name: string; country: string; town: string; receivingCompanyId: ID;
  lat: number; lng: number; radiusM: number; active: boolean;
}
export type WarehouseRow = Warehouse & { lat?: number; lng?: number; radiusM?: number; active?: boolean };

type Api = {
  addWarehouse?: (w: WarehouseInput) => Promise<unknown>;
  updateWarehouse?: (id: ID, w: Partial<WarehouseInput>) => Promise<unknown>;
};
const api = masterdata as unknown as Api;
export const serverBacked = () => typeof api.addWarehouse === 'function';

const local: WarehouseRow[] = [];
const patches = new Map<ID, Partial<WarehouseRow>>();

export function listWarehouses(): WarehouseRow[] {
  const base = (ref().warehouses as WarehouseRow[]).map((w) => {
    const cp = lookup.checkpoint(w.checkpointId);
    return { ...w, lat: w.lat ?? cp?.lat, lng: w.lng ?? cp?.lng, radiusM: w.radiusM ?? cp?.radiusM, active: w.active ?? true, ...(patches.get(w.id) ?? {}) };
  });
  return [...base, ...local.filter((l) => !base.some((b) => b.id === l.id))];
}

export async function saveWarehouse(id: ID | null, input: WarehouseInput): Promise<{ local: boolean }> {
  if (id && typeof api.updateWarehouse === 'function') { await api.updateWarehouse(id, input); return { local: false }; }
  if (!id && typeof api.addWarehouse === 'function') { await api.addWarehouse(input); return { local: false }; }
  if (id) patches.set(id, { ...(patches.get(id) ?? {}), ...input });
  else local.push({ id: `w-new-${Date.now().toString(36)}`, checkpointId: '', ...input });
  return { local: true };
}

export const warehouseLabel = (w: Pick<Warehouse, 'country' | 'town' | 'name'>) => (w.country && w.town ? `${w.country} – ${w.town}` : w.name);
