// The journeys. Each takes a shared `ctx` (people + ids carried between journeys).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  OUT, BASE, WEB, FIELD, API, MAILPIT, PASS, PHOTO, sleep, sql, person, webSignIn, webGo, fieldSignIn, slide, knobLabel, waitForLabel, sign,
  apiLogin, apiToken, apiGet, apiPost, overflow, step, startJourney, must, VIEW,
} from './lib.mjs';

export const PH = {
  director: '+254700000001', planner: '+254700000002', joel: '+254700000003', tesfie: '+254700000006',
  asie: '+250700000007', zonas: '+211900000008', accounts: '+254700000009', admin: '+254700000010',
  peter: '+254711000001', hassan: '+254711000003', moses: '+211911000007', said: '+255711000006',
};
const text = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const legOf = async (token, legId) => { for (const s of await apiGet(token, '/shipments')) { const l = s.legs.find((x) => x.id === legId); if (l) return { s, l }; } return null; };

// ------------------------------------------------------------------------------------------------
// 5. Role guards
export async function roleGuards(ctx) {
  startJourney('5 · Role guards (web + field)');
  const w = await person('web-driver');
  await step('driver signs in on the web → “Use the BTW field app”, no office screens', w, async () => {
    await w.page.fill('#login-user', PH.peter); await w.page.fill('#login-pass', PASS);
    await w.page.click('form button:has-text("Sign in")'); await sleep(2000);
    must(/Use the BTW field app/.test(await text(w.page)), 'no field-app screen');
    must(await w.page.locator('a:has-text("Open the field app")').getAttribute('href') === FIELD, 'field link wrong');
    for (const hash of ['/plans', '/users', '/finance']) { await webGo(w, hash, 600); must(!(await w.page.locator('aside.side').count()), `office shell shown at ${hash}`); }
  });
  const lo = await person('web-loader');
  await step('loading-point user on the web: loading allowed, users/finance blocked', lo, async () => {
    await webSignIn(lo, PH.joel);
    await webGo(lo, '/loading', 1500); must(/Loading/i.test(await text(lo.page)), 'loading screen missing');
    for (const hash of ['/users', '/finance', '/plans/new']) {
      await webGo(lo, hash, 900);
      must(/no access|not available|isn.t available for your role/i.test(await text(lo.page)), `loader reached ${hash}`);
    }
  }, { allow: ['403'] });
  const f = await person('field-director', { kind: 'field' });
  await step('director on the field app gets “Use the web app” with a working link', f, async () => {
    await fieldSignIn(f, PH.director);
    must(/Use the web app/.test(await text(f.page)), 'no web-only screen');
    const href = await f.page.locator('a:has-text("Open")').getAttribute('href');
    must(href === WEB, `web link is ${href}, expected ${WEB}`);
  });
  const fp = await person('field-wrong-pin', { kind: 'field' });
  await step('wrong PIN is refused with a clear message', fp, async () => {
    await fieldSignIn(fp, PH.asie, '9999').catch(() => {});
    must(/wrong|incorrect/i.test(await text(fp.page)), 'no wrong-PIN message');
  }, { allow: ['401', 'Failed to load resource'] });
  for (const p of [w, lo, f, fp]) await p.ctx.close();
}

// ------------------------------------------------------------------------------------------------
// 4. Onboarding: admin creates a driver, sets a PIN; the driver signs in; remote sign-out kicks them.
async function createFieldUser(admin, { name, phone, role = 'Driver' }) {
  const page = admin.page;
  await webGo(admin, '/users', 1500);
  await page.click('button:has-text("New user")'); await sleep(300);
  const d = page.locator('dialog[open]');
  await d.locator('#u-name').fill(name); await d.locator('#u-phone').fill(phone);
  await d.locator('label.chip', { hasText: role }).locator('input').check();
  await d.locator('button:has-text("Create user")').click(); await sleep(1500);
  must(!(await page.locator('dialog[open] .error').count()), await page.locator('dialog[open] .error').innerText().catch(() => 'create failed'));
  await page.locator('tr.clickable', { hasText: name }).click(); await sleep(800);
  await page.locator('dialog[open] button:has-text("Set new PIN")').click(); await sleep(1200);
  const notice = await page.locator('dialog[open] .notice').innerText();
  const pin = notice.match(/:\s*(\d{4,6})\./)?.[1];
  must(pin, `no PIN shown: ${notice}`);
  await page.locator('dialog[open] button:has-text("Cancel")').click().catch(() => {}); await sleep(200);
  return pin;
}
export async function onboarding(ctx) {
  startJourney('4 · Onboarding a driver, remote sign-out');
  const admin = ctx.admin = await person('admin');
  await webSignIn(admin, PH.admin);
  await step('admin creates driver “Moses Lado” (first name shared with loader Moses)', admin, async () => {
    const pinM = await createFieldUser(admin, { name: 'Moses Lado', phone: PH.moses }); ctx.mosesPin = pinM; return `PIN ${pinM}`;
  });
  await admin.page.locator('dialog[open] button:has-text("Cancel")').click().catch(() => {});
  let pin;
  await step('admin creates driver Said Juma and sets a PIN', admin, async () => { pin = ctx.saidPin = await createFieldUser(admin, { name: 'Said Juma', phone: PH.said }); return `PIN ${pin}`; });
  const m = ctx.said = await person('said-phone', { kind: 'field' });
  await step('Said signs in on the field app with the new PIN', m, async () => {
    await fieldSignIn(m, PH.said, pin);
    must(/all clear|Next|Ready to go/i.test(await text(m.page)), 'not on the driver screen');
  });
  await step('admin sees the phone under Devices and signs it out remotely', admin, async () => {
    await admin.page.locator('dialog[open] button:has-text("Cancel")').click().catch(() => {});
    await webGo(admin, '/users', 1200);
    await admin.page.locator('tr.clickable', { hasText: 'Said Juma' }).click(); await sleep(1200);
    const btn = admin.page.locator('dialog[open] button:has-text("Sign out remotely")');
    must(await btn.count(), 'no device listed');
    await btn.first().click(); await sleep(1000);
    must(await admin.page.locator('dialog[open]', { hasText: 'Signed out' }).count(), 'device not marked signed out');
    await admin.page.locator('dialog[open] button:has-text("Cancel")').click();
  });
  await step('Said’s phone returns to sign-in on its own (no reload)', m, async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 40000) { if (await m.page.locator('input[type=tel]').count()) return `after ${Math.round((Date.now() - t0) / 1000)} s`; await sleep(1000); }
    throw new Error('still signed in 40 s after remote sign-out');
  }, { allow: ['401'] });
  await step('Said can sign in again with his PIN', m, async () => { await fieldSignIn(m, PH.said, pin); must(!(await m.page.locator('input[type=tel]').count()), 'sign-in failed'); });
}

// ------------------------------------------------------------------------------------------------
// 7. Brand page + favicons
export async function brand() {
  startJourney('7 · Brand page and favicons');
  const p = await person('brand');
  await step('/brand/ loads every logo image (no 404s)', p, async () => {
    await p.page.goto(`${BASE}/brand/`); await p.page.waitForLoadState('networkidle');
    const bad = await p.page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')));
    const n = await p.page.evaluate(() => document.images.length);
    must(n > 20, `only ${n} images`); must(!bad.length, `broken: ${bad.slice(0, 5).join(', ')}`);
    return `${n} images`;
  });
  for (const [name, url] of [['web', WEB], ['field', FIELD]]) {
    await step(`${name} app has a favicon that loads`, p, async () => {
      await p.page.goto(url); await sleep(500);
      const href = await p.page.evaluate(() => document.querySelector('link[rel~="icon"]')?.href ?? '');
      must(href, 'no <link rel=icon>');
      const r = await fetch(href); must(r.ok && /image/.test(r.headers.get('content-type') ?? ''), `favicon ${href} → ${r.status}`);
      return href.replace(BASE, '');
    });
  }
  await p.ctx.close();
}

// ------------------------------------------------------------------------------------------------
// 1 (+3). The full chain across people, with offline check-ins and an SMS check-in mid-route.
const toast = async (page) => (await page.locator('.toast').innerText().catch(() => '')).trim();
async function checkIn(p, re, { undoFirst = false } = {}) {
  const page = p.page;
  const label = await waitForLabel(page, re);
  if (undoFirst) {
    await slide(page);
    await page.locator('button:has-text("Undo")').click();
    must(/Cancelled/.test(await toast(page)), 'no "Cancelled" message');
    await sleep(6500);
    must((await knobLabel(page)) === label, 'label changed after undo');
  }
  await slide(page);
  must(await page.locator('button:has-text("Undo")').count(), 'no undo window after slide');
  await sleep(5600); // undo window → sent
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && (await knobLabel(page)) === label) await sleep(300);
  must((await knobLabel(page)) !== label || /Arrived at/.test(await text(page)), `still “${label}” after sending`);
  return label;
}
async function legPasses(token, legId) { const x = await legOf(token, legId); return x?.l.passes ?? []; }
const cpPass = (passes, id) => passes.find((q) => q.checkpointId === id) ?? {};

export async function fullChain(ctx) {
  startJourney('1 · Full chain: plan → approval → PO → hand-over → trip (offline, problem, undo) → receipt');
  const admin = ctx.admin ?? (ctx.admin = await person('admin'));
  if (!(await admin.page.locator('aside.side').count())) await webSignIn(admin, PH.admin);
  await step('admin onboards driver Hassan Ali (phone in the KBL queue)', admin, async () => { ctx.hassanPin = await createFieldUser(admin, { name: 'Hassan Ali', phone: PH.hassan }); await admin.page.locator('dialog[open] button:has-text("Cancel")').click().catch(() => {}); return `PIN ${ctx.hassanPin}`; });

  // Planner → director
  const planner = await person('planner'); await webSignIn(planner, PH.planner);
  let planHash = '';
  await step('planner creates a plan with a mixed-load truck and submits it', planner, async () => {
    const page = planner.page;
    await webGo(planner, '/plans/new', 1200); await page.click('button:has-text("Create draft")'); await sleep(1800);
    ctx.planTitle = `E2E mixed-load order ${Date.now().toString(36)}`;
    await page.fill('input[placeholder^="e.g. October"]', ctx.planTitle);
    await page.click('button:has-text("Add truck")'); await sleep(300);
    await page.locator('[aria-label="Quantity, truck 1"]').first().fill('1200');
    await page.click('[aria-label="Add brand to truck 1"]'); await sleep(300);
    const qty = page.locator('[aria-label="Quantity, truck 1"]'); must((await qty.count()) === 2, 'mixed-load line not added');
    await qty.nth(1).fill('600');
    must(/Truck 1 subtotal/.test(await text(page)), 'no truck subtotal row');
    await page.click('button:has-text("Submit for approval")'); await sleep(2500);
    planHash = await page.evaluate(() => location.hash.slice(1));
    must(await page.locator('text=Submitted').count(), 'not submitted');
    return planHash;
  });
  const director = ctx.director = await person('director'); await webSignIn(director, PH.director);
  let poRef = '';
  await step('director approves with a drawn signature', director, async () => {
    const page = director.page;
    await webGo(director, planHash, 1800);
    await page.click('button:has-text("Approve & sign")'); await sleep(400);
    await sign(page, page.locator('dialog[open] canvas'));
    await page.click('dialog[open] button:has-text("Approve & sign")'); await sleep(2500);
    must(await page.locator('text=Approved').count(), 'not approved');
    poRef = ctx.poRef = (await page.locator('h1 .mono, h1').first().innerText()).match(/[A-Z]{3}-PO-\d{4}-\d{4}/)?.[0] ?? '';
    return poRef;
  });
  await step('PO letter: server PDF downloads; “Email to supplier” lands in Mailpit', director, async () => {
    const page = director.page;
    await page.locator('a:has-text("View purchase order")').first().click(); await sleep(1500);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('button:has-text("Download PDF")')]);
    const file = path.join(OUT, 'po.pdf'); await dl.saveAs(file);
    const buf = readFileSync(file); must(buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 5000, `PDF bad (${buf.length} bytes)`);
    const since = Date.now();
    await page.locator('button:has-text("Email to supplier")').click(); await sleep(2500);
    // Mailpit is shared and PO numbers repeat across databases: match the supplier address + this run's plan title.
    const q = encodeURIComponent(`subject:"${ctx.planTitle}" to:export@kbl.example`);
    let hit;
    for (let i = 0; i < 20 && !hit; i++) { // the PDF is rendered before sending: allow a few seconds
      const msgs = await (await fetch(`${MAILPIT}/api/v1/search?query=${q}&limit=5`)).json();
      hit = msgs.messages?.find((m) => Date.parse(m.Created) >= since - 5000 && m.Subject.includes(poRef));
      if (!hit) await sleep(1000);
    }
    must(hit, `no supplier email for ${poRef} in Mailpit`);
    must(hit.Attachments >= 1, 'email has no PDF attachment');
    return `${buf.length} B PDF · mail “${hit.Subject}”`;
  });

  // Field: Hassan signs in first (no trip yet), Joel hands over, Hassan's phone picks it up on its own.
  const hassan = ctx.hassan = await person('hassan-phone', { kind: 'field' });
  await step('Hassan signs in → no trip yet', hassan, async () => { await fieldSignIn(hassan, PH.hassan, ctx.hassanPin); must(/all clear/i.test(await text(hassan.page)), 'expected empty state'); });
  const joel = await person('joel-phone', { kind: 'field' });
  await step('Joel (KBL) sees the new PO truck and Hassan’s truck at the head of the queue', joel, async () => {
    await fieldSignIn(joel, PH.joel);
    const t = await text(joel.page); must(t.includes(poRef), `next order is not ${poRef}: ${t.slice(0, 160)}`); must(/KDB 456B/.test(t), 'KDB 456B not first in queue');
  });
  await step('Joel loads and hands over with a document photo and the agreed price', joel, async () => {
    const page = joel.page;
    await page.click('button:has-text("Load this truck")'); await sleep(600);
    const sheet = page.locator('section.sheet.modal');
    must(/Hassan Ali/.test(await sheet.locator('select').inputValue().then(async (v) => (await sheet.locator(`select option[value="${v}"]`).innerText()))), 'driver is not Hassan');
    const vals = await sheet.locator('.stepper input').evaluateAll((els) => els.map((e) => +e.value));
    must(vals.join() === '1200,600', `prefilled ${vals}`);
    await sheet.locator('input[type=file]').setInputFiles(PHOTO); await sleep(300);
    must(await sheet.locator('.thumb img').count(), 'photo thumbnail missing');
    await sheet.locator('input[placeholder="e.g. 1650"]').fill('1650');
    await slide(page, sheet); await sleep(2500);
    must(/handed over/.test(await toast(page)), `toast: ${await toast(page)}`);
  });
  await step('Hassan’s phone shows the trip without a reload', hassan, async () => { await waitForLabel(hassan.page, /Start trip/, 30000); });

  const token = await apiToken({ username: 'dir', password: PASS });
  const trip = await (async () => { for (const s of await apiGet(token, '/shipments')) for (const l of s.legs) if (l.driverId === 'd3' && l.status !== 'Acknowledged') return { s, l }; return null; })();
  ctx.chain = { shipmentId: trip?.s.id, legId: trip?.l.id };
  const H = hassan;
  await step('Hassan starts the trip and checks in at Gilgil, using Undo once', H, async () => {
    await checkIn(H, /Start trip/);
    await checkIn(H, /arrived at Gilgil/, { undoFirst: true });
    await checkIn(H, /leaving Gilgil/);
    const gil = cpPass(await legPasses(token, ctx.chain.legId), 'cp-gilgil');
    must(gil.arrivedAt && gil.departedAt && gil.source === 'driver', `Gilgil pass ${JSON.stringify(gil)}`);
  });
  await step('Eldoret in and out', H, async () => { await checkIn(H, /arrived at Eldoret/); await checkIn(H, /leaving Eldoret/); });

  await step('offline: two check-ins at Webuye are kept on the phone', H, async () => {
    await H.ctx.setOffline(true); await sleep(300);
    for (const re of [/arrived at Webuye/, /leaving Webuye/]) {
      await waitForLabel(H.page, re); await slide(H.page); await sleep(5600);
    }
    await waitForLabel(H.page, /arrived at Malaba/, 10000);
    const pill = await H.page.locator('.pill').innerText();
    must(/Offline · 2 saved/.test(pill), `pill says “${pill}”`);
    const web = cpPass(await legPasses(token, ctx.chain.legId), 'cp-webuye');
    must(!web.arrivedAt, 'server already has Webuye while phone offline');
  }, { allow: ['ERR_INTERNET_DISCONNECTED', 'Failed to fetch', 'net::'] });
  await step('back online: both check-ins sync in one batch, source “driver”', H, async () => {
    const before = Number(sql(`select count(*) from audit_log where user_id like 'u-%' and path = '/v1/sync/batch' and user_id = (select id from users where phone = '${PH.hassan}')`));
    await H.ctx.setOffline(false); await H.page.evaluate(() => dispatchEvent(new Event('online')));
    const t0 = Date.now(); while (Date.now() - t0 < 20000 && !/Online/.test(await H.page.locator('.pill').innerText())) await sleep(500);
    must(/Online/.test(await H.page.locator('.pill').innerText()), 'still not synced');
    const web = cpPass(await legPasses(token, ctx.chain.legId), 'cp-webuye');
    must(web.arrivedAt && web.departedAt && web.source === 'driver', `Webuye pass ${JSON.stringify(web)}`);
    const after = Number(sql(`select count(*) from audit_log where path = '/v1/sync/batch' and user_id = (select id from users where phone = '${PH.hassan}')`));
    must(after - before === 1, `${after - before} sync batches after reconnect (expected 1)`);
  });
  await step('Malaba border: arrive, border-wait note, report a problem, then “Fixed — moving again”', H, async () => {
    const page = H.page;
    await checkIn(H, /arrived at Malaba/);
    must(/Waiting at the border/.test(await text(page)), 'no border-wait note');
    await page.click('button:has-text("Problem")'); await sleep(400);
    await page.click('button.reason:has-text("Border / documents")');
    await page.fill('input[placeholder="e.g. waiting for a mechanic"]', 'T1 not stamped');
    await page.click('button:has-text("Tell the office")'); await sleep(2000);
    const fixed = page.locator('button:has-text("Fixed — moving again")'); must(await fixed.count(), 'no “Fixed” button');
    const x = await legOf(token, ctx.chain.legId); must(x.l.issues.some((i) => /Border/.test(i.reason) && !i.fixedAt), 'issue not on server');
    await fixed.click(); await sleep(2500);
    must(await page.locator('.knob').count(), 'slide not back after fix');
    const y = await legOf(token, ctx.chain.legId); must(y.l.issues.every((i) => i.fixedAt), 'issue not fixed on server');
    await checkIn(H, /leaving Malaba/);
  });
  await step('3 · SMS “ARR KAMPALA KDB456B” from Hassan’s phone updates his app without reload', H, async () => {
    await waitForLabel(H.page, /arrived at Kampala/);
    const r = await apiPost('/dev/sms/inbound', { from: PH.hassan, text: 'arr kampala kdb 456b' });
    must(r.status === 200, `SMS endpoint ${r.status} ${JSON.stringify(r.body)}`);
    const l = await waitForLabel(H.page, /leaving Kampala/, 30000);
    const k = cpPass(await legPasses(token, ctx.chain.legId), 'cp-kampala'); must(k.source === 'sms', `Kampala source ${k.source}`);
    return `${l} · reply: ${JSON.stringify(r.body).slice(0, 120)}`;
  });
  await step('rest of the route to Kigali (Mbarara, Katuna border)', H, async () => {
    for (const re of [/leaving Kampala/, /arrived at Mbarara/, /leaving Mbarara/, /arrived at Katuna/, /leaving Katuna/, /arrived at Asie warehouse Kigali/]) await checkIn(H, re);
    must(/Arrived at Asie warehouse Kigali/.test(await text(H.page)), 'not at destination');
  });
  await step('web: shipment detail + tracking show the driver, SMS and office sources', director, async () => {
    await webGo(director, `/shipments/${ctx.chain.shipmentId}`, 2000);
    const t = await text(director.page);
    must(/driver tap/.test(t) && /SMS/.test(t), 'timeline sources missing');
    await webGo(director, '/tracking', 3000);
  });

  // Receiver
  const stockBefore = (await apiGet(token, '/stock')).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-a300');
  const asie = ctx.asie = await person('asie-phone', { kind: 'field' });
  await step('Asie receives with damage, photo and signature', asie, async () => {
    const page = asie.page;
    await fieldSignIn(asie, PH.asie);
    must(/KDB 456B is here/.test(await text(page)), 'arrived truck not shown first');
    await page.click('button:has-text("Receive & sign")'); await sleep(500);
    await page.click('button:has-text("Something is short or damaged")'); await sleep(300);
    const dmg = page.locator('input[aria-label$="damaged"]').first(); await dmg.fill('6'); await dmg.press('Tab');
    await page.fill('input[placeholder="e.g. 6 crates crushed"]', '6 crates crushed');
    await page.locator('section.sheet.modal input[type=file]').setInputFiles(PHOTO);
    await page.click('button:has-text("Next")'); await sleep(300);
    must(/6 short or damaged/.test(await text(page)), 'summary missing discrepancy');
    await page.fill('input[autocomplete=name]', 'Jeanne Uwase');
    await sign(page, page.locator('section.sheet.modal canvas'));
    await slide(page, page.locator('section.sheet.modal')); await sleep(2500);
    must(/Delivery received/.test(await toast(page)), `toast: ${await toast(page)}`);
  });
  await step('web: discrepancy alert, stock up, transport cost + landing cost, analytics render', director, async () => {
    const page = director.page;
    await webGo(director, '/notifications', 1500); must(/discrepanc/i.test(await text(page)), 'no discrepancy notification');
    const after = (await apiGet(token, '/stock')).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-a300');
    must(after.received - (stockBefore?.received ?? 0) === 1200 && after.damaged - (stockBefore?.damaged ?? 0) === 6, `stock delta received ${after.received - (stockBefore?.received ?? 0)} damaged ${after.damaged - (stockBefore?.damaged ?? 0)}`);
    await webGo(director, '/inventory', 1500);
    await webGo(director, '/finance', 1800); const f = await text(page); must(/1,650/.test(f), 'transport 1,650 not on finance');
    await webGo(director, '/analytics', 2000); must(!(await page.locator('.err[role=alert]').count()), 'analytics error state');
    const sh = (await apiGet(token, '/shipments')).find((s) => s.id === ctx.chain.shipmentId); must(sh.status === 'Acknowledged', `shipment ${sh.status}`);
  });
  await joel.ctx.close(); await planner.ctx.close();
}

// ------------------------------------------------------------------------------------------------
// 2. Transfer leg: Nairobi → (Kigali, unload & reload) → Goma, two drivers, two receipts.
async function driveTo(p, destRe, max = 30, deadlineMs = 8 * 60_000) {
  const t0 = Date.now();
  for (let i = 0; i < max; i++) {
    if (destRe.test(await text(p.page)) && !(await p.page.locator('.knob').count())) return;
    if (Date.now() - t0 > deadlineMs) throw new Error(`not at destination after ${Math.round((Date.now() - t0) / 1000)} s`);
    const l = await waitForLabel(p.page, /.+/);
    console.log(`      ${p.name}: ${l}`);
    await checkIn(p, new RegExp(l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  throw new Error('destination not reached');
}
export async function transferLeg(ctx) {
  startJourney('2 · Transfer leg: Nairobi → Kigali (unload, reload) → Goma, two drivers');
  const admin = ctx.admin ?? (ctx.admin = await person('admin'));
  if (!(await admin.page.locator('aside.side').count())) await webSignIn(admin, PH.admin);
  if (!ctx.hassanPin) ctx.hassanPin = await createFieldUser(admin, { name: 'Hassan Ali', phone: PH.hassan });
  if (!ctx.saidPin) ctx.saidPin = await createFieldUser(admin, { name: 'Said Juma', phone: PH.said });
  await admin.page.locator('dialog[open] button:has-text("Cancel")').click().catch(() => {});
  const token = await apiToken({ username: 'dir', password: PASS });
  const director = ctx.director ?? (ctx.director = await person('director'));
  if (!(await director.page.locator('aside.side').count())) await webSignIn(director, PH.director);

  const joel = await person('joel-phone-2', { kind: 'field' });
  await step('Joel hands over PO truck 4 (Nairobi → Goma) to Hassan', joel, async () => {
    const page = joel.page; await fieldSignIn(joel, PH.joel);
    must(/truck 4/i.test(await text(page)), `next order is not truck 4: ${(await text(page)).slice(0, 160)}`);
    await page.click('button:has-text("Load this truck")'); await sleep(600);
    const sheet = page.locator('section.sheet.modal');
    await sheet.locator('select').selectOption({ label: 'Hassan Ali' });
    await sheet.locator('input[placeholder="e.g. 1650"]').fill('1500');
    await slide(page, sheet); await sleep(2500);
    must(/handed over/.test(await toast(page)), `toast: ${await toast(page)}`);
  });
  const sh = await (async () => { for (const x of await apiGet(token, '/shipments')) if (x.legs.some((l) => l.driverId === 'd3' && l.status !== 'Acknowledged')) return x; return null; })();
  must(sh, 'no shipment for Hassan');
  const refb = await apiGet(token, '/ref');
  const reg1 = refb.trucks.find((t) => t.id === sh.legs[0].truckId)?.reg;
  ctx.transfer = { shipmentId: sh.id, reg1 };
  await step('office plans the transfer: “Unload & transfer at Asie warehouse Kigali”', director, async () => {
    await webGo(director, `/shipments/${sh.id}`, 1800);
    await director.page.click('button:has-text("Unload & transfer at Asie warehouse Kigali")'); await sleep(1500);
    const x = (await apiGet(token, '/shipments')).find((y) => y.id === sh.id); must(x.legs[0].toId === 'cp-kigali', `leg 1 ends at ${x.legs[0].toId}`);
  });
  const hassan = ctx.hassan ?? (ctx.hassan = await person('hassan-phone', { kind: 'field' }));
  if (!(await hassan.page.locator('.sheet').count())) await fieldSignIn(hassan, PH.hassan, ctx.hassanPin);
  await step('Hassan drives leg 1 to Kigali (stops there, not Goma)', hassan, async () => {
    await waitForLabel(hassan.page, /Start trip/, 30000);
    await driveTo(hassan, /Arrived at Asie warehouse Kigali/);
  });
  const asie = ctx.asie ?? (ctx.asie = await person('asie-phone', { kind: 'field' }));
  if (!(await asie.page.locator('.sheet').count())) await fieldSignIn(asie, PH.asie);
  await step('Asie receives at Kigali as a transfer point (not into stock)', asie, async () => {
    const page = asie.page;
    const here = `${reg1} is here`;
    const t0 = Date.now(); while (Date.now() - t0 < 30000 && !(await text(page)).includes(here)) await sleep(1000);
    must((await text(page)).includes(here), `“${here}” not shown`);
    await page.click('button:has-text("Receive & sign")'); await sleep(400);
    await page.click('button:has-text("Everything arrived OK")'); await sleep(300);
    must(/Transfer point/.test(await text(page)), 'not marked as transfer point');
    await page.fill('input[autocomplete=name]', 'Jeanne Uwase');
    await sign(page, page.locator('section.sheet.modal canvas'));
    await slide(page, page.locator('section.sheet.modal')); await sleep(2500);
  });
  await step('office adds leg 2 Kigali → Goma (too-small trucks not offered) with Said driving RAD 310E', director, async () => {
    const page = director.page;
    await webGo(director, `/shipments/${sh.id}`, 1800);
    await page.click('button:has-text("Add next leg (transfer)")'); await sleep(800);
    const d = page.locator('dialog[open]');
    const truckSel = d.locator('label:has-text("Truck") select');
    const small = await truckSel.locator('option', { hasText: 'T 512 DFG' }).evaluate((o) => ({ disabled: o.disabled, text: o.textContent }));
    must(small.disabled, `1,800-case truck offered for a 2,000-case leg (“${small.text}”)`);
    const opt = await truckSel.locator('option', { hasText: 'RAD 310E' }).getAttribute('value');
    await truckSel.selectOption(opt);
    await d.locator('label:has-text("Driver") select').selectOption({ label: 'Said Juma' });
    await d.locator('button:has-text("Plan leg")').click(); await sleep(1500);
    const x = (await apiGet(token, '/shipments')).find((y) => y.id === sh.id); must(x.legs.length === 2 && x.legs[1].driverId === 'd6', 'leg 2 not planned for Said');
  });
  await step('Asie sends it on: “Load & hand over” → slide', asie, async () => {
    const page = asie.page;
    const t0 = Date.now(); while (Date.now() - t0 < 30000 && !/RAD 310E to/.test(await text(page))) await sleep(1000);
    must(/RAD 310E to/.test(await text(page)), 'send-on card missing');
    await page.click('button:has-text("Load & hand over")'); await sleep(500);
    await slide(page, page.locator('section.sheet.modal')); await sleep(2500);
    must(/on its way/.test(await toast(page)), `toast: ${await toast(page)}`);
  });
  const said = ctx.said ?? (ctx.said = await person('said-phone', { kind: 'field' }));
  if (!(await said.page.locator('.sheet').count()) || (await said.page.locator('input[type=tel]').count())) await fieldSignIn(said, PH.said, ctx.saidPin);
  await step('Said drives leg 2 through the Gisenyi/Goma border to Goma', said, async () => {
    await waitForLabel(said.page, /Gisenyi/, 30000);
    await driveTo(said, /Arrived at Asie warehouse Goma/);
  });
  await step('Asie receives at Goma: final receipt closes the shipment', asie, async () => {
    const page = asie.page;
    const t0 = Date.now(); while (Date.now() - t0 < 30000 && !/RAD 310E is here/.test(await text(page))) await sleep(1000);
    await page.click('button:has-text("Receive & sign")'); await sleep(400);
    await page.click('button:has-text("Everything arrived OK")'); await sleep(300);
    must(/Goes into stock now/.test(await text(page)), 'not marked final');
    await page.fill('input[autocomplete=name]', 'Jeanne Uwase');
    await sign(page, page.locator('section.sheet.modal canvas'));
    await slide(page, page.locator('section.sheet.modal')); await sleep(2500);
    const x = (await apiGet(token, '/shipments')).find((y) => y.id === sh.id);
    must(x.status === 'Acknowledged' && x.legs.every((l) => l.status === 'Acknowledged'), `shipment ${x.status} / legs ${x.legs.map((l) => l.status)}`);
  });
  await step('web: shipment shows both legs reconciled', director, async () => {
    await webGo(director, `/shipments/${sh.id}`, 1800);
    const t = await text(director.page); must(/Leg 2/i.test(t) && /Acknowledged/.test(t), 'legs not shown');
  });
  await joel.ctx.close();
}

// ------------------------------------------------------------------------------------------------
// 6. Every page at several widths: no horizontal overflow, no console errors/failed requests; visible focus.
async function focusVisible(page, selector, maxTabs = 40) {
  await page.evaluate(() => (document.activeElement)?.blur?.());
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((sel) => {
      const el = document.activeElement; if (!el || !el.matches(sel)) return null;
      const cs = getComputedStyle(el);
      return { outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1, shadow: cs.boxShadow !== 'none', tag: el.tagName, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40) };
    }, selector);
    if (hit) return hit;
  }
  return null;
}
const WEB_PAGES = ['/', '/plans', '/plans/new', '/pos', '/loading', '/shipments', '/tracking', '/inventory', '/sales', '/finance', '/analytics', '/master', '/notifications', '/users'];
export async function layoutSweep() {
  startJourney('6 · Layout, errors and keyboard focus on every page');
  for (const [vw, viewport] of [['1440', VIEW.desktop], ['1024', VIEW.laptop], ['390', VIEW.phone]]) {
    const p = await person(`web-${vw}`, { viewport });
    await step(`web @${vw}: sign-in focus ring on “Sign in”`, p, async () => {
      await p.page.fill('#login-user', PH.director);
      const f = await focusVisible(p.page, 'form button'); must(f && (f.outline || f.shadow), `no visible focus on Sign in (${JSON.stringify(f)})`);
    });
    await webSignIn(p, PH.director);
    for (const pg of [...WEB_PAGES, ...(vw === '1440' ? ['/integrations'] : [])]) {
      if (pg === '/integrations') await webSignIn(p, PH.admin);
      await step(`web @${vw} ${pg}`, p, async () => {
        await webGo(p, pg, pg === '/tracking' ? 3000 : 1500);
        const o = await overflow(p.page); must(!o.over, `page ${o.width}px wide in ${o.viewport}px: ${o.culprits.join(', ')}`);
        must(!(await p.page.locator('.err[role=alert]').count()), 'error state shown');
      });
    }
    await p.ctx.close();
  }
  for (const [vw, w] of [['360', 360], ['390', 390], ['430', 430]]) {
    for (const [who, phone, pin] of [['driver', PH.peter, '1234'], ['loading point', PH.joel, '1234'], ['receiver', PH.zonas, '1234']]) {
      const f = await person(`field-${vw}-${who.replace(' ', '-')}`, { kind: 'field', viewport: { width: w, height: 800 } });
      await step(`field @${vw} ${who}: home + menu fit, focus visible on the main action`, f, async () => {
        await fieldSignIn(f, phone, pin);
        let o = await overflow(f.page); must(!o.over, `home ${o.width}px in ${o.viewport}px: ${o.culprits.join(', ')}`);
        const focus = await focusVisible(f.page, '.knob, .btn-accent, .btn-primary, .btn-secondary');
        must(!focus || focus.outline || focus.shadow, `no visible focus on ${focus?.text}`);
        await f.page.click('button[aria-label="Menu"]'); await sleep(500);
        o = await overflow(f.page); must(!o.over, `menu ${o.width}px in ${o.viewport}px: ${o.culprits.join(', ')}`);
        must(!/Reset demo data/.test(await text(f.page)), '“Reset demo data” shown to a field user on the live API');
        return focus ? `focus: ${focus.text}` : 'no primary action on screen';
      });
      await f.ctx.close();
    }
  }
}
