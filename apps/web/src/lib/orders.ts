// Purchase orders under the config.toml rules: director approval on/off, labels, and revisions made at loading.
import { ref, type Plan, type PurchaseOrder } from '@btw/api';
import { planStatusLabel } from '@btw/api/rules';
import type { Tone } from '@btw/ui';

/** true = a director approves every PO before it is issued (config.toml [approvals] purchase_orders). */
export const poApprovals = () => !!ref().config?.approvals.purchaseOrders;
/** "Issued", "Approved", "Ready to issue", "Revised", or the stored status. */
export const planLabel = (p: Plan) => planStatusLabel(p, ref().config);
const TONES: Record<string, Tone> = { Issued: 'success', Approved: 'success', 'Ready to issue': 'info', Revised: 'neutral', Submitted: 'info', Draft: 'neutral', Returned: 'warning', Rejected: 'danger', Active: 'success', Replaced: 'neutral' };
export const labelTone = (label: string): Tone => TONES[label] ?? 'neutral';
/** 1 → "rev001". */
export const revTag = (n?: number) => `rev${String(n ?? 0).padStart(3, '0')}`;
/** The PO of a chain that is in force: not superseded by a later revision. */
export const isCurrent = (po: PurchaseOrder) => !po.supersededById;
/** Group POs by their original: one row per order with the latest revision and the whole chain (original first). */
export function groupRevisions(list: PurchaseOrder[]) {
  const chains = new Map<string, PurchaseOrder[]>();
  for (const po of list) { const k = po.revisionOf ?? po.id; chains.set(k, [...(chains.get(k) ?? []), po]); }
  return [...chains.values()].map((c) => {
    const chain = [...c].sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
    return { latest: chain.find(isCurrent) ?? chain.at(-1)!, base: chain[0], chain };
  });
}
