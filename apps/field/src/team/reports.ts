// Reports for team screens. With the real API (VITE_API=http) these are the client's thin GET calls. In the in-browser
// demo (mock) the same pure report functions run over the demo data — loaded in a lazy chunk (mock-reports.ts), so
// the ~20 KB report engine never lands in the field app's entry bundle (80 KB budget). The build-time env check
// removes the unused branch. Gap: packages/api could expose this split itself (e.g. a lazily imported mock reports module).
import { reports as clientReports } from '@btw/api';

export type Reports = Pick<typeof clientReports, 'dashboard' | 'sales' | 'logistics' | 'inventory' | 'plannedVsActual' | 'resolvePeriod'>;
let local: Promise<Reports> | null = null;
export function reportsApi(): Promise<Reports> {
  if (import.meta.env.VITE_API === 'http') return Promise.resolve(clientReports);
  return (local ??= import('./mock-reports').then((m) => m.mockReports));
}
