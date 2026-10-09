// The only module screens import. The implementation is chosen at build time: Vite apps alias
// '@btw/api/client' to mock-client.ts (default) or http.ts (VITE_API=http) via packages/api/vite.mjs,
// so the unused client is not bundled. Call `await ready()` once before rendering.
import * as impl from '@btw/api/client';

export * from './types';
export { amount } from './rules';

/** 'mock' (in-browser demo data) or 'http' (real API). */
export const mode: 'mock' | 'http' = impl.mode;
export const {
  ready, configure, onChange, auth, ref, lookup, plans, pos, loading, shipments, inventory, sales, finance, analytics,
  notifications, demo, queue, tracking, field, masterdata, users, devices, files, sync,
} = impl;
