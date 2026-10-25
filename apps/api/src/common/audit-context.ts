// docs/12 A-07: a service can say which record a request changed and its values before / after; the audit
// interceptor writes them on the request's one audit row. Request-scoped via AsyncLocalStorage.
import { AsyncLocalStorage } from 'node:async_hooks';

export interface AuditNote { recordType?: string; recordId?: string; summary?: string; before?: unknown; after?: unknown; entityId?: string | null }
export const auditStore = new AsyncLocalStorage<AuditNote>();
/** Add what changed to this request's audit row (no-op outside a request). */
export function auditNote(n: AuditNote) { const s = auditStore.getStore(); if (s) Object.assign(s, n); }

const SECRET = /pass(word)?|pin|secret|token|hash/i;
/** Request body as stored in the audit log: secrets dropped, long strings (images, signatures) shortened, size capped. */
export function auditBody(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v === 'string') return v.length > 240 ? `${v.slice(0, 60)}… (${v.length} chars)` : v;
  if (typeof v !== 'object') return v;
  if (depth > 4) return '…';
  if (Array.isArray(v)) return v.slice(0, 25).map((x) => auditBody(x, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !SECRET.test(k)).slice(0, 40).map(([k, x]) => [k, auditBody(x, depth + 1)]));
}
/** "/v1/masterdata/products/p-1" → { feature: 'masterdata', recordType: 'products', recordId: 'p-1' } (best effort). */
export function auditPath(path: string) {
  const seg = path.replace(/^\/?(v1\/)?/, '').split('/').filter(Boolean);
  const feature = seg[0] ?? 'other';
  if (feature === 'masterdata') return { feature, recordType: seg[1] ?? null, recordId: seg[2] ?? null };
  return { feature, recordType: seg.length > 1 ? feature : null, recordId: seg[1] ?? null };
}
