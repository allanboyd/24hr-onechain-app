import type { Config } from '../../config/config';
import type { RoutingPort } from '../ports';

type Pt = { lat: number; lng: number };
const R = 6371;
export function haversineKm(a: Pt, b: Pt) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Offline estimate: road ≈ straight line × 1.3, loaded truck ≈ 50 km/h average. */
export function straightLine(points: Pt[]) {
  const legs = points.slice(1).map((p, i) => { const km = haversineKm(points[i], p) * 1.3; return { distanceKm: Math.round(km), hours: Math.round((km / 50) * 10) / 10 }; });
  return { distanceKm: legs.reduce((a, l) => a + l.distanceKm, 0), hours: Math.round(legs.reduce((a, l) => a + l.hours, 0) * 10) / 10, legs };
}

/** OSRM (public demo or self-hosted). Car durations × TRUCK_TIME_FACTOR. Falls back to straight-line on any failure. */
export class OsrmRouting implements RoutingPort {
  constructor(private readonly cfg: Config) {}
  async route(points: Pt[]) {
    if (points.length < 2) return { distanceKm: 0, hours: 0, legs: [] };
    try {
      const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
      const res = await fetch(`${this.cfg.OSRM_URL.replace(/\/$/, '')}/route/v1/driving/${coords}?overview=false`, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { code: string; routes: { distance: number; duration: number; legs: { distance: number; duration: number }[] }[] };
      if (j.code !== 'Ok' || !j.routes[0]) throw new Error(j.code);
      const f = this.cfg.TRUCK_TIME_FACTOR;
      const legs = j.routes[0].legs.map((l) => ({ distanceKm: Math.round(l.distance / 1000), hours: Math.round((l.duration / 3600) * f * 10) / 10 }));
      return { distanceKm: Math.round(j.routes[0].distance / 1000), hours: Math.round((j.routes[0].duration / 3600) * f * 10) / 10, legs };
    } catch {
      return straightLine(points);
    }
  }
}
