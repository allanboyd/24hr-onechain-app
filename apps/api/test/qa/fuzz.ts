// Every route × junk bodies × unknown ids: the API must answer 2xx/4xx, never 5xx.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { client, ok, ROOT, section, type Env } from './harness';

function routes() {
  const out: { method: string; path: string }[] = [];
  for (const f of ['src/http/controllers.ts', 'src/integrations/controllers.ts']) {
    let prefix = '';
    for (const line of readFileSync(path.join(ROOT, f), 'utf8').split('\n')) {
      const c = line.match(/@Controller\((?:'([^']*)')?\)/); if (c) prefix = c[1] ? `/${c[1]}` : '';
      for (const m of line.matchAll(/@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)/g)) out.push({ method: m[1].toUpperCase(), path: `${prefix}${m[2] ? `/${m[2]}` : ''}` });
    }
  }
  return out;
}
const SKIP = ['/auth/logout', '/dev/reset', '/auth/devices/:id/revoke'];
const JUNK: (string | undefined)[] = [undefined, '{}', '[]', '"x"', 'null', '42', '{"entityId":1,"supplierId":[],"lines":{},"items":5,"kind":9,"checkpointId":{},"qty":"x","truckId":null,"legId":[],"input":"x","payload":7,"op":{},"idempotencyKey":3,"amount":"lots","stops":"x","roles":"admin","reason":{},"receiverName":[],"lat":"n","phone":5,"name":7,"reg":9,"driverName":[],"company":{},"providerId":1,"warehouseId":3,"customer":{},"reference":2,"shipmentId":{},"costId":[],"action":1,"comment":{},"signature":5,"title":{},"pin":1234,"password":12345678}', '{"lines":[null,1,"x"],"items":[null,{"lat":"x"}],"stops":[{}]}'];

export async function fuzzSuite(env: Env) {
  const c = client(env.base);
  const dir = (await c.login('dir')).accessToken;
  const drv = (await c.login('+254711000001', '1234')).accessToken;
  section('Fuzz · every route with junk input (no 5xx)');
  const list = routes().filter((r) => !SKIP.includes(r.path));
  const bad: string[] = [];
  let n = 0;
  // real ids so handlers get past "not found" and meet the junk
  const ships = (await c.req('GET', '/shipments', { token: dir })).body as any[];
  const leg = ships.flatMap((x) => x.legs).find((l: any) => l.status !== 'Acknowledged');
  const plans = (await c.req('GET', '/plans', { token: dir })).body as any[];
  const real: Record<string, string> = {
    id: 'nope-123', legId: leg.id, checkpointId: leg.passes[1].checkpointId, issueId: 'nope', kind: 'trucks',
  };
  const realFor = (p: string) => p
    .replace(/^\/plans\/:id/, `/plans/${plans.find((x) => x.status === 'Approved')?.id ?? plans[0].id}`)
    .replace(/^\/shipments\/:id/, `/shipments/${ships[0].id}`).replace(/^\/legs\/:id/, `/legs/${leg.id}`)
    .replace(/^\/loadings\/:id/, `/loadings/${((await_loadings as any[]).find((l) => l.status === 'Pending') ?? await_loadings[0])?.id}`)
    .replace(/^\/users\/:id/, '/users/u-drv2').replace(/^\/pos\/:id/, '/pos/po-1').replace(/^\/loading-points\/:id/, '/loading-points/s-kbl')
    .replace(/:([a-zA-Z]+)/g, (_, k) => real[k] ?? 'nope-123');
  const await_loadings = (await c.req('GET', '/loadings', { token: dir })).body as any[];
  for (const r of [...list.map((x) => ({ ...x, real: false })), ...list.filter((x) => x.path.includes(':')).map((x) => ({ ...x, real: true }))]) {
    const p = r.real ? realFor(r.path) : r.path.replace(/:[a-zA-Z]+/g, 'nope-123');
    for (const token of [dir, drv]) for (const body of r.method === 'GET' || r.method === 'DELETE' ? [undefined] : JUNK) {
      const res = await c.req(r.method, p, { token, raw: body, headers: body === undefined ? {} : { 'content-type': 'application/json' } });
      n++;
      if (res.status >= 500) bad.push(`${r.method} ${r.path} ${body ?? ''} → ${res.status}`);
      if (/insert into|select .* from|Failed query/i.test(JSON.stringify(res.body))) bad.push(`${r.method} ${r.path} leaks SQL`);
    }
  }
  ok(!bad.length, `${list.length} routes, ${n} junk requests — no 5xx, no SQL leaks`, bad.slice(0, 12).join(' | '));
}
