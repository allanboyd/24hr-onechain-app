// Light load: 50 drivers (own accounts, trucks and legs) posting GPS pings, check-ins (sync batch) and refreshing
// their trip for 60 s. Reports p50/p95/p99 per call type and errors.
import { client, ok, section, type Env } from './harness';

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };

export async function loadSuite(env: Env, opts = { drivers: 50, seconds: 60 }) {
  const c = client(env.base);
  const N = opts.drivers;
  section(`Load · setting up ${N} drivers with their own trucks`);
  const dir = (await c.login('dir')).accessToken; const planner = (await c.login('kabonge')).accessToken;
  let plan = (await c.req('POST', '/plans', { token: planner, body: { entityId: 'e-btw', supplierId: 's-kbl' } })).body;
  plan = (await c.req('PUT', `/plans/${plan.id}`, { token: planner, body: { title: 'QA load', lines: Array.from({ length: N }, (_, i) => ({ truckNo: i + 1, productId: 'p-a300', qty: 100, price: 1, routeId: 'r-nbo-kgl', deliveredToId: 'rc-asie' })) } })).body;
  await c.req('POST', `/plans/${plan.id}/submit`, { token: planner });
  const po = (await c.req('POST', `/plans/${plan.id}/decision`, { token: dir, body: { action: 'approved', signature: SIG } })).body.poId;
  const provider = (await c.req('POST', '/masterdata/providers', { token: dir, body: { name: 'QA Load Haulage' } })).body;
  const loadings = ((await c.req('GET', '/loadings?loadingPointId=s-kbl', { token: dir })).body as any[]).filter((l) => l.poId === po).sort((a, b) => a.truckNo - b.truckNo);
  const drivers: { phone: string; legId: string; token?: string }[] = [];
  for (let i = 0; i < N; i++) {
    const phone = `+2547990${String(i).padStart(5, '0')}`;
    const d = (await c.req('POST', '/masterdata/drivers', { token: dir, body: { providerId: provider.id, name: `QA Driver ${i}`, phone, hasApp: true } })).body;
    const t = (await c.req('POST', '/masterdata/trucks', { token: dir, body: { providerId: provider.id, reg: `QAL ${String(i).padStart(3, '0')}X`, trailer: `ZQ ${i}`, capacityCases: 2000, defaultDriverId: d.id } })).body;
    await c.req('POST', '/users', { token: dir, body: { name: `QA Driver ${i}`, phone, roles: ['driver'], pin: '1234' } });
    const ld = loadings[i];
    const sh = (await c.req('POST', `/loadings/${ld.id}/confirm`, { token: dir, body: { truckId: t.id, driverId: d.id, loadedQty: { [ld.lines[0].planLineId]: 100 }, agreedTransport: 500 } })).body;
    await c.req('POST', `/legs/${sh.legs[0].id}/dispatch`, { token: dir, body: {} });
    drivers.push({ phone, legId: sh.legs[0].id });
  }
  for (const d of drivers) d.token = (await c.login(d.phone, '1234')).accessToken;
  ok(drivers.every((d) => d.token && d.legId), `${N} drivers signed in, each on a dispatched trip`);

  section(`Load · ${N} drivers for ${opts.seconds} s`);
  const lat: Record<string, number[]> = { ping: [], checkin: [], refresh: [] };
  const errors: string[] = [];
  const end = Date.now() + opts.seconds * 1000;
  const headers = { 'x-channel': 'app', 'x-app-version': '1.0.0' };
  const run = async (d: (typeof drivers)[number], n: number) => {
    let i = 0;
    const route = (await c.req('GET', '/field/driver', { token: d.token, headers })).body.trips[0];
    let k = route.leg.passes.findIndex((p: any) => !p.arrivedAt);
    await new Promise((r) => setTimeout(r, (n * 37) % 1000)); // stagger
    while (Date.now() < end) {
      i++;
      try {
        const cp = route.checkpoints[Math.min(k, route.checkpoints.length - 2)];
        const r = await c.req('POST', '/positions', { token: d.token, headers, body: [{ legId: d.legId, lat: cp.lat + 0.3 + Math.random() * 0.1, lng: cp.lng + 0.3, accuracyM: 20 }] });
        lat.ping.push(r.ms); if (r.status >= 400) errors.push(`ping ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
        if (i % 8 === 0 && k < route.checkpoints.length - 1) {
          const kind = i % 16 === 0 ? 'departed' : 'arrived';
          const b = await c.req('POST', '/sync/batch', { token: d.token, headers, body: [{ idempotencyKey: crypto.randomUUID(), op: 'leg.pass', payload: { legId: d.legId, checkpointId: route.checkpoints[k].id, kind } }] });
          lat.checkin.push(b.ms);
          if (b.status >= 400 || b.body?.[0]?.status === 'rejected') errors.push(`checkin ${b.status} ${JSON.stringify(b.body?.[0]?.error ?? b.body).slice(0, 120)}`);
          if (kind === 'departed') k++;
        }
        if (i % 15 === 0) { const f = await c.req('GET', '/field/driver', { token: d.token, headers }); lat.refresh.push(f.ms); if (f.status >= 400) errors.push(`refresh ${f.status}`); }
      } catch (e) { errors.push(`network ${(e as Error).message}`); }
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
  // Cache churn: a director edits master data every 2 s while drivers are busy. With a 1.5 s reference-cache TTL and a
  // small pool this deadlocked the API before the fix (transactions held every connection while waiting on the cache).
  const churn = (async () => { let i = 0; while (Date.now() < end) { await c.req('POST', '/masterdata/providers', { token: dir, body: { name: `QA churn ${i++}` } }).catch(() => {}); await new Promise((r) => setTimeout(r, 2000)); } })();
  const t0 = Date.now();
  await Promise.all([...drivers.map((d, n) => run(d, n)), churn]);
  const secs = (Date.now() - t0) / 1000;
  const total = lat.ping.length + lat.checkin.length + lat.refresh.length;
  const stats = Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, { n: v.length, p50: Math.round(pct(v, 50)), p95: Math.round(pct(v, 95)), p99: Math.round(pct(v, 99)), max: Math.round(Math.max(0, ...v)) }]));
  console.log(`   ${total} requests in ${secs.toFixed(0)} s (${(total / secs).toFixed(1)} req/s)`);
  for (const [k, s] of Object.entries(stats)) console.log(`   ${k.padEnd(8)} n=${s.n} p50=${s.p50} ms p95=${s.p95} ms p99=${s.p99} ms max=${s.max} ms`);
  if (errors.length) console.log('   server log tail:\n' + env.log().split('\n').filter((l) => /error|warn|exception|timeout/i.test(l)).slice(-15).join('\n'));
  ok(errors.length === 0, `no errors under load (${errors.length})`, [...new Set(errors)].slice(0, 5));
  ok(stats.ping.p95 < 1000, `GPS ping p95 under 1 s (${stats.ping.p95} ms)`);
  ok(stats.checkin.p95 < 1500, `check-in p95 under 1.5 s (${stats.checkin.p95} ms)`);
  ok(stats.refresh.p95 < 2000, `trip refresh p95 under 2 s (${stats.refresh.p95} ms)`);
  return { stats, total, secs, errors: errors.length };
}
