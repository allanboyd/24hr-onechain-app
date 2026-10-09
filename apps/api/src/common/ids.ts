import { randomBytes } from 'node:crypto';
/** Prefixed, URL-safe, sortable-enough ids (same style as the mock: `plan-…`, `leg-…`). */
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
export const iso = (t: number = Date.now()) => new Date(t).toISOString();
