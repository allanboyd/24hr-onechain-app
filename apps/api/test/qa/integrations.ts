// Integrations end-to-end with the REAL inbound handler (tracking), Mailpit, push store and files.
import { client, expectStatus, ok, section, type Env } from './harness';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:18025';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export async function integrationsSuite(env: Env) {
  const c = client(env.base);
  const T = { dir: (await c.login('dir')).accessToken, plan: (await c.login('kabonge')).accessToken, joel: (await c.login('joel')).accessToken, drv1: (await c.login('+254711000001', '1234')).accessToken };
  const legOf = async (token: string) => (await c.req('GET', '/field/driver', { token })).body.trips[0];

  section('Integrations · driver SMS (Africa\'s Talking format) → tracking');
  let trip = await legOf(T.drv1);
  const nextCp = trip.checkpoints[trip.leg.passes.findIndex((p: any) => !p.arrivedAt)];
  let r = await c.req('POST', '/dev/sms/inbound', { body: { from: '+254711000001', text: `arr ${nextCp.code.toLowerCase()} kda 123a` } });
  ok(r.body.ok === true && new RegExp(nextCp.name.split(' ')[0], 'i').test(r.body.reply), `driver SMS "arr ${nextCp.code.toLowerCase()} kda 123a" applied: ${r.body.reply}`, r.body);
  trip = await legOf(T.drv1);
  ok(trip.leg.passes.find((p: any) => p.checkpointId === nextCp.id).source === 'sms', 'pass recorded with source = sms');
  const outbox = (await c.req('GET', '/dev/sms?phone=%2B254711000001')).body as any[];
  ok(outbox.some((m) => m.direction === 'out' && /arrived at/i.test(m.text)), 'reply SMS sent to the driver');
  r = await c.req('POST', '/dev/sms/inbound', { body: { from: '+254799000000', text: `DEP ${nextCp.code} KDA123A` } });
  ok(r.body.ok === false && /not registered/i.test(r.body.reply), 'SMS from an unknown phone naming the plate is refused (spoofing)', r.body);
  trip = await legOf(T.drv1);
  ok(!trip.leg.passes.find((p: any) => p.checkpointId === nextCp.id).departedAt, '… and nothing changed on the trip');
  r = await c.req('POST', '/dev/sms/inbound', { body: { from: '+254700000002', text: `DEP ${nextCp.code} KDA123A` } });
  ok(r.body.ok === true, 'fleet office phone (Kabonge) may report for any truck', r.body);
  r = await c.req('POST', '/webhooks/sms', { form: { from: '+254711000001', text: 'ISSUE KDA123A POLICE', to: '20880', date: new Date().toISOString(), id: 'at-1' } });
  ok(r.status === 200 && r.body.ok === true, 'AT form-encoded webhook (ISSUE … POLICE) accepted', r.body);
  trip = await legOf(T.drv1);
  ok(trip.leg.issues.some((i: any) => /police/i.test(i.reason) && !i.fixedAt), 'issue opened from SMS');
  r = await c.req('POST', '/webhooks/sms', { form: { from: '+254711000001', text: 'FIX KDA123A' } });
  trip = await legOf(T.drv1);
  ok(r.body.ok && trip.leg.issues.every((i: any) => i.fixedAt), 'FIX closes the issue');
  r = await c.req('POST', '/webhooks/sms', { form: { from: '+254711000001', text: 'hello?' } });
  ok(r.status === 200 && r.body.ok === false, 'gibberish SMS → help reply, no 500', r.body);
  expectStatus(await c.req('POST', '/webhooks/sms', { form: { text: 'ARR X' } }), 400, 'webhook without sender → 400');

  section('Integrations · USSD menu walk');
  const drv2 = '+256711000002';
  r = await c.req('POST', '/webhooks/ussd', { form: { sessionId: 's1', phoneNumber: drv2, serviceCode: '*384#', text: '' } });
  ok(typeof r.body === 'string' && r.body.startsWith('CON') && /arrived at/i.test(r.body), 'USSD root menu offers the next checkpoint', r.body);
  const before = (await c.req('GET', '/shipments', { token: T.dir })).body.find((s: any) => s.legs.some((l: any) => l.driverId === 'd2' && l.status !== 'Acknowledged'));
  const legD2 = before.legs.find((l: any) => l.driverId === 'd2' && l.status !== 'Acknowledged');
  r = await c.req('POST', '/webhooks/ussd', { form: { sessionId: 's1', phoneNumber: drv2, text: '3' } });
  ok(String(r.body).startsWith('CON') && /Breakdown/.test(r.body), 'option 3 → problem list', r.body);
  r = await c.req('POST', '/webhooks/ussd', { form: { sessionId: 's1', phoneNumber: drv2, text: '3*2' } });
  const after = (await c.req('GET', `/shipments/${before.id}`, { token: T.dir })).body.legs.find((l: any) => l.id === legD2.id);
  ok(String(r.body).startsWith('END') && after.issues.length > legD2.issues.length, 'option 3*2 opens a Border/documents issue', { reply: r.body, issues: after.issues.length });
  r = await c.req('POST', '/webhooks/ussd', { form: { sessionId: 's2', phoneNumber: drv2, text: '2' } });
  const left = (await c.req('GET', `/shipments/${before.id}`, { token: T.dir })).body.legs.find((l: any) => l.id === legD2.id);
  ok(String(r.body).startsWith('END') && left.passes.filter((p: any) => p.departedAt).length > legD2.passes.filter((p: any) => p.departedAt).length, 'option 2 records departure from the border', r.body);
  r = await c.req('POST', '/webhooks/ussd', { form: { sessionId: 's3', phoneNumber: '+254799000000', text: '' } });
  ok(String(r.body).startsWith('END') && /No active trip/i.test(r.body), 'unknown phone → END, no trip leaked', r.body);
  r = await c.req('POST', '/webhooks/ussd', { form: { sessionId: 's4', phoneNumber: drv2, text: '9' } });
  ok(String(r.body).startsWith('END Invalid'), 'invalid choice → END Invalid choice', r.body);

  section('Integrations · GPS pings → geofence (PostGIS)');
  trip = await legOf(T.drv1);
  const idx = trip.leg.passes.findIndex((p: any) => !p.arrivedAt);
  const target = trip.checkpoints[idx];
  r = await c.req('POST', '/positions', { token: T.drv1, headers: { 'x-channel': 'app' }, body: [{ legId: trip.leg.id, lat: target.lat + 0.001, lng: target.lng }] });
  ok(r.status === 202 && r.body.events.some((e: any) => e.checkpointId === target.id && e.kind === 'arrived'), `ping inside ${target.name} (radius ${target.radiusM} m) → automatic arrival`, r.body);
  r = await c.req('POST', '/positions', { token: T.drv1, headers: { 'x-channel': 'app' }, body: [{ legId: trip.leg.id, lat: target.lat + 0.5, lng: target.lng + 0.5 }] });
  ok(r.body.events.some((e: any) => e.checkpointId === target.id && e.kind === 'departed'), 'ping far away → automatic departure', r.body);
  const src = (await legOf(T.drv1)).leg.passes.find((p: any) => p.checkpointId === target.id);
  ok(src.source === 'geofence', 'source = geofence', src);
  const pos = await env.sql`select count(*)::int as n from positions where leg_id = ${trip.leg.id}`;
  ok(pos[0].n >= 2, 'location history stored (TR-06)', pos[0]);

  section('Integrations · email (Mailpit), push, files');
  const since = Date.now();
  r = await c.req('POST', '/pos/po-1/send', { token: T.plan });
  ok(r.status === 200, 'PO sent to supplier', r.body);
  let mail: any = null;
  for (let i = 0; i < 20 && !mail; i++) {
    const list = await fetch(`${MAILPIT}/api/v1/messages?limit=20`).then((x) => x.json()).catch(() => null) as any;
    mail = list?.messages?.find((m: any) => Date.parse(m.Created) >= since - 2000 && /BTW-PO-\d{4}-0002/.test(m.Subject));
    if (!mail) await new Promise((res) => setTimeout(res, 300));
  }
  ok(mail && mail.To.some((t: any) => /kbl/i.test(t.Address)), `email in Mailpit to the KBL export section: "${mail?.Subject}"`, mail?.To);
  const detail = mail ? await fetch(`${MAILPIT}/api/v1/message/${mail.ID}`).then((x) => x.json()) : null;
  ok(detail?.Attachments?.some((a: any) => a.ContentType === 'application/pdf' && a.Size > 5000), 'PO PDF attached', detail?.Attachments?.map((a: any) => [a.FileName, a.ContentType, a.Size]));
  const sent = (await c.req('GET', '/pos/po-1', { token: T.plan })).body.po;
  ok(sent.sentAt && Date.parse(sent.sentAt) >= since - 2000, 'sentAt recorded (PO-03)');

  await c.req('POST', '/devices', { token: T.drv1, headers: { 'x-channel': 'app' }, body: { pushToken: 'qa-push-token-drv1', platform: 'android', appVersion: '1.0.0' } });
  const pend = ((await c.req('GET', '/loadings?loadingPointId=s-kbl', { token: T.joel })).body as any[]).find((l) => l.status === 'Pending');
  const ref = (await c.req('GET', '/ref', { token: T.dir })).body;
  const truck = ref.trucks.find((t: any) => t.reg === 'KCX 220D');
  r = await c.req('POST', `/loadings/${pend.id}/confirm`, { token: T.joel, body: { truckId: truck.id, driverId: 'd1', loadedQty: Object.fromEntries(pend.lines.map((l: any) => [l.planLineId, l.orderedQty])), agreedTransport: 900 } });
  ok(r.status === 201, 'hand-over (loading) to drv1', r.body);
  await new Promise((res) => setTimeout(res, 300));
  const pushes = (await c.req('GET', '/dev/push')).body as any[];
  ok(pushes.some((p) => p.tokens?.includes?.('qa-push-token-drv1') || JSON.stringify(p).includes('qa-push-token-drv1')), 'push recorded for the driver on hand-over', pushes.slice(0, 2));
  const inApp = (await c.req('GET', '/notifications', { token: T.drv1 })).body as any[];
  ok(inApp.some((n) => /trip assigned|loaded/i.test(n.title)), 'driver gets a personal in-app notification', inApp.map((n) => n.title));

  r = await c.req('POST', '/files', { token: T.drv1, body: { kind: 'photo', name: 'damage.png', contentType: 'image/png', dataBase64: PNG } });
  ok([200, 201].includes(r.status) && r.body.url && r.body.id, 'photo upload', r.body);
  const url = new URL(r.body.url, env.base.replace(/\/v1$/, '/'));
  const dl = await fetch(url.href.startsWith('http') ? url.href : `${env.base.replace(/\/v1$/, '')}${r.body.url}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  ok(dl.status === 200 && bytes.equals(Buffer.from(PNG, 'base64')), 'signed download returns the same bytes', dl.status);
  const forged = url.href.replace(/sig=[^&]+/, 'sig=AAAA');
  ok((await fetch(forged)).status === 403, 'forged signature → 403');
  ok((await fetch(url.href.split('?')[0])).status === 403, 'unsigned link → 403');
  expectStatus(await c.req('POST', '/files', { token: T.drv1, body: { kind: 'photo', name: 'x.html', contentType: 'text/html', dataBase64: Buffer.from('<script>alert(1)</script>').toString('base64') } }), 400, 'HTML disguised as a photo refused');
  expectStatus(await c.req('POST', '/files', { body: { kind: 'photo', contentType: 'image/png', dataBase64: PNG } }), 401, 'upload requires a session');
}
