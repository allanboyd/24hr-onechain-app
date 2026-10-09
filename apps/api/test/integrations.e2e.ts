// Integrations e2e: boots IntegrationsModule alone (fake INBOUND_HANDLER), exercises parser, SMS/USSD, mail→Mailpit, files, PDF, routing.
// Run: pnpm --filter @btw/server test:integrations   (needs `docker compose up -d mail` for the Mailpit check)
import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { IntegrationsModule } from '../src/integrations/integrations.module';
import { INBOUND_HANDLER, MAIL, PDF, type InboundCheckin, type InboundHandler, type MailPort, type PdfPort } from '../src/integrations/ports';
import { parseDriverSms } from '../src/integrations/inbound/parser';

let failed = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('ok  ', m); else { failed++; console.log('FAIL', m); } };

// ---- 1. Parser table ----------------------------------------------------
const cases: [string, Partial<InboundCheckin> | null][] = [
  ['ARR MALABA KDA123A', { kind: 'arrived', checkpointCode: 'MALABA', truckReg: 'KDA123A' }],
  ['arr malaba kda 123a', { kind: 'arrived', checkpointCode: 'MALABA', truckReg: 'KDA123A' }],
  ['  Arrived   Gatuna  T 512 DFG ', { kind: 'arrived', checkpointCode: 'GATUNA', truckReg: 'T512DFG' }],
  ['ARR KDA123A MALABA', { kind: 'arrived', checkpointCode: 'MALABA', truckReg: 'KDA123A' }],
  ['ARR WEBUYE WB KDA-123A.', { kind: 'arrived', checkpointCode: 'WEBUYE WB', truckReg: 'KDA123A' }],
  ['DEP MALABA UBA 789C', { kind: 'departed', checkpointCode: 'MALABA', truckReg: 'UBA789C' }],
  ['dep rusumo rad310e', { kind: 'departed', checkpointCode: 'RUSUMO', truckReg: 'RAD310E' }],
  ['ARR MALABA', { kind: 'arrived', checkpointCode: 'MALABA', truckReg: '' }],
  ['FIX KDA 123A', { kind: 'fixed', truckReg: 'KDA123A' }],
  ['off ssd410k', { kind: 'offloading', truckReg: 'SSD410K' }],
  ['ISSUE KDA123A BREAKDOWN', { kind: 'problem', truckReg: 'KDA123A', reason: 'breakdown' }],
  ['issue kda123a customs', { kind: 'problem', truckReg: 'KDA123A', reason: 'border' }],
  ['HELLO THERE', null],
  ['', null],
];
for (const [text, want] of cases) {
  const r = parseDriverSms(text);
  if (!want) { ok(!r.ok, `parser rejects "${text}"`); continue; }
  ok(r.ok && Object.entries(want).every(([k, v]) => (r.checkin as any)[k] === v), `parser "${text}" → ${JSON.stringify(r.ok ? r.checkin : r)}`);
}

// ---- 2. HTTP round-trips with a fake tracking handler ---------------------
const calls: InboundCheckin[] = [];
const fakeHandler: InboundHandler = {
  async handleCheckin(c) { calls.push(c); return { ok: true, reply: `OK ${c.truckReg || 'KDA123A'} ${c.kind}${c.checkpointCode ? ' ' + c.checkpointCode : ''}` }; },
  async driverStatus(phone) { return phone === '+254711000001' ? { truckReg: 'KDA123A', legId: 'leg-1', nextCheckpoint: { code: 'MBARARA', name: 'Mbarara' } } : null; },
};
@Global() @Module({ providers: [{ provide: INBOUND_HANDLER, useValue: fakeHandler }], exports: [INBOUND_HANDLER] })
class FakeTracking {}
@Module({ imports: [FakeTracking, IntegrationsModule] })
class TestApp {}

(async () => {
  const app = await NestFactory.create<NestFastifyApplication>(TestApp, new FastifyAdapter(), { logger: ['error', 'warn'] });
  app.setGlobalPrefix('v1');
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/v1`.replace('[::1]', '127.0.0.1');
  const post = (p: string, body: unknown, form = false) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(body as Record<string, string>) : JSON.stringify(body) });

  const st = await (await fetch(base + '/dev/integrations')).json() as any;
  ok(st.sms && st.inboundHandler === 'tracking (api-core)', `status: ${JSON.stringify(st)}`);

  // SMS webhook, AT form-encoded
  const w = await post('/webhooks/sms', { from: '+254711000001', text: 'arr malaba kda 123a', to: '22384', date: new Date().toISOString() }, true);
  ok(w.status === 200, `POST /webhooks/sms (form) → ${w.status}`);
  ok(calls.at(-1)?.kind === 'arrived' && calls.at(-1)?.checkpointCode === 'MALABA' && calls.at(-1)?.channel === 'sms', 'webhook hands check-in to tracking');
  const inbox = await (await fetch(base + '/dev/sms?phone=%2B254711000001')).json() as any;
  ok(inbox[0]?.direction === 'out' && /OK KDA123A arrived MALABA/.test(inbox[0].text), `reply SMS recorded: "${inbox[0]?.text}"`);
  const bad = await (await post('/dev/sms/inbound', { from: '+254711000001', text: 'where am i' })).json() as any;
  ok(!bad.ok && /Codes:/.test(bad.reply), 'unknown code gets help reply');

  // USSD walk
  const u = async (text: string, phone = '+254711000001') => (await (await post('/webhooks/ussd', { sessionId: 's1', serviceCode: '*384#', phoneNumber: phone, text }, true)).text());
  const m0 = await u('');
  ok(m0.startsWith('CON') && m0.includes("I've arrived at Mbarara"), `USSD menu: ${JSON.stringify(m0)}`);
  ok((await u('1')).startsWith('END OK KDA123A arrived MBARARA'), 'USSD 1 → arrived at next checkpoint');
  ok((await u('3')).startsWith('CON What is the problem'), 'USSD 3 → problem menu');
  const p = await u('3*2');
  ok(p.startsWith('END') && calls.at(-1)?.kind === 'problem' && calls.at(-1)?.reason === 'border', 'USSD 3*2 → border problem');
  ok((await u('', '+254700999999')).startsWith('END No active trip'), 'USSD unknown phone');

  // Files: upload, signed link, tamper rejected, type rules
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = await (await post('/files', { kind: 'photo', name: 'dmg.png', contentType: 'image/png', dataBase64: png.toString('base64') })).json() as any;
  ok(/^[a-f0-9]{40}\.png$/.test(up.id) && up.size === png.length, `upload → ${up.id}`);
  const dl = await fetch(up.url.replace(/^https?:\/\/[^/]+\/v1/, base));
  ok(dl.status === 200 && (await dl.arrayBuffer()).byteLength === png.length && dl.headers.get('content-type') === 'image/png', 'signed download works');
  ok((await fetch(base + `/files/${up.id}?exp=9999999999&sig=forged`)).status === 403, 'forged signature rejected');
  ok((await post('/files', { kind: 'photo', contentType: 'application/pdf', dataBase64: 'JVBERi0=' })).status === 400, 'photo must be an image');

  // Email → Mailpit
  const mail = app.get<MailPort>(MAIL);
  const subject = `BTW integration test ${Date.now()}`;
  try {
    await mail.send({ to: 'director@btw.local', subject, text: 'Plan awaiting approval', attachments: [{ filename: 'po.txt', content: Buffer.from('hi') }] });
    await new Promise((r) => setTimeout(r, 500));
    const found = await (await fetch(`http://localhost:18025/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`)).json() as { messages_count: number };
    ok(found.messages_count === 1, 'mail landed in Mailpit');
  } catch (e) { ok(false, `mail to Mailpit (is \`docker compose up -d mail\` running?): ${(e as Error).message}`); }

  // PDF
  const pdf = app.get<PdfPort>(PDF);
  const t0 = Date.now();
  const letter = await pdf.render('po-letter', {
    entity: { name: 'BTW Global Distributors Ltd', code: 'BTW', address: 'Nairobi, Kenya' }, date: '2026-09-08T07:00:00Z',
    ref: 'BTW-PO-2026-0002', title: 'Order No. 2', addressedTo: { name: 'KBL', city: 'Nairobi', country: 'Kenya' }, currency: 'USD',
    lines: [{ truckNo: 1, brand: 'Brand A Lager', pack: '24 x 300 ml', qty: 2000, price: 11.5 }, { truckNo: 2, brand: 'Brand A Lager', pack: '24 x 300 ml', qty: 1200, price: 11.5 }, { truckNo: 2, brand: 'Brand B Stout', pack: '24 x 500 ml', qty: 800, price: 18.2 }],
    preparedBy: { name: 'Kabonge', title: 'Operations officer' }, approvedBy: { name: 'Director', at: '2026-09-08T10:02:00Z', signature: `data:image/png;base64,${png.toString('base64')}` },
  });
  ok(letter.subarray(0, 5).toString() === '%PDF-' && letter.length > 20_000, `PO letter PDF ${Math.round(letter.length / 1024)} KB in ${Date.now() - t0} ms`);
  const ack = await pdf.render('acknowledgement', {
    shipmentRef: 'SHP-2026-0043', legSeq: 1, legCount: 2, truckReg: 'RAD 310E', from: 'KBL Nairobi', to: 'Asie Kigali', warehouse: 'Asie Kigali', receivingCompany: 'Asie',
    receivedAt: new Date().toISOString(), receiverName: 'J. Uwase', finalDestination: false,
    lines: [{ brand: 'Brand B Stout', pack: '24 x 500 ml', expected: 2000, received: 1994, damaged: 6, remarks: 'crushed' }], photos: [up.id],
  });
  ok(ack.subarray(0, 5).toString() === '%PDF-', `acknowledgement PDF ${Math.round(ack.length / 1024)} KB`);
  if (process.env.PDF_OUT) { require('node:fs').writeFileSync(`${process.env.PDF_OUT}/po-letter.pdf`, letter); require('node:fs').writeFileSync(`${process.env.PDF_OUT}/ack.pdf`, ack); }

  // Routing (OSRM or straight-line fallback)
  const r = await (await post('/dev/route', { points: [{ lat: -1.242, lng: 36.88 }, { lat: 0.6346, lng: 34.2786 }] })).json() as any;
  ok(r.distanceKm > 300 && r.distanceKm < 700 && r.hours > 4, `Nairobi → Malaba: ${r.distanceKm} km, ${r.hours} h`);

  await app.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall integration checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
