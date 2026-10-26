// Purchase orders (docs/09 §4): created, updated (= a revision) or deleted — never drafted. Labels, tones, prefill.
import { ref, type Plan, type PoStage, type PoVersion, type PurchaseOrder } from '@btw/api';
import { planStatusLabel } from '@btw/api/rules';
import type { Tone } from '@btw/ui';

/** true = a director approves every PO before it is issued (config.toml [approvals] purchase_orders). */
export const poApprovals = () => !!ref().config?.approvals.purchaseOrders;
/** "Issued", "Awaiting approval", "Revised" or "Deleted". */
export const planLabel = (p: Plan) => planStatusLabel(p, ref().config);
const TONES: Record<string, Tone> = {
  Issued: 'success', Approved: 'success', Revised: 'neutral', Deleted: 'danger', Active: 'success', Replaced: 'neutral',
  'Awaiting approval': 'warning', Created: 'info', Sent: 'info', 'Sent to supplier': 'info', Loading: 'accent', 'On the road': 'accent', Delivered: 'success',
};
export const labelTone = (label: string): Tone => TONES[label] ?? 'neutral';
/** Status chips of the Purchase orders list (Awaiting approval only when approval is switched on). */
export const STAGES = (): PoStage[] => [...(poApprovals() ? ['Awaiting approval' as const] : []), 'Created', 'Sent', 'Loading', 'On the road', 'Delivered', 'Deleted'];
export const stageLabel = (s?: PoStage) => (s === 'Sent' ? 'Sent to supplier' : s ?? '—');
/** 1 → "rev001". */
export const revTag = (n?: number) => `rev${String(n ?? 0).padStart(3, '0')}`;
/** "Original" / "Updated by office" / "Revised at loading". */
export const versionKind = (v: Pick<PoVersion, 'kind'>) => (v.kind === 'original' ? 'Original' : v.kind === 'updated' ? 'Updated by office' : 'Revised at loading');
/** The PO of a chain that is in force: not superseded by a later revision. */
export const isCurrent = (po: PurchaseOrder) => !po.supersededById;

// ---- "Order this" from a report → the Create purchase order form, prefilled (nothing is created until the planner saves) ----
export interface PrefillItem { supplierId: string; productId: string; warehouseId: string; trucks: number; capacity: number; routeIds: string[] }
export interface Prefill { supplierId: string; entityId?: string; title: string; items: PrefillItem[] }
const KEY = 'btw-po-prefill';
export function setPrefill(queue: Prefill[]) { try { sessionStorage.setItem(KEY, JSON.stringify(queue)); } catch { /* private mode */ } }
/** The next prefilled order (and the number still queued after it). */
export function takePrefill(): { next: Prefill | null; left: number } {
  try { const q = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Prefill[]; const next = q.shift() ?? null; sessionStorage.setItem(KEY, JSON.stringify(q)); return { next, left: q.length }; } catch { return { next: null, left: 0 }; }
}
export const prefillLeft = () => { try { return (JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as unknown[]).length; } catch { return 0; } };
