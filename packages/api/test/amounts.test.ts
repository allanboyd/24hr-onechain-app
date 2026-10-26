// docs/17 F4 / CHECKLIST F-0a: amount sanity rules (packages/api/src/amounts.ts), the seeded data passes them (the USD 3,050,000
// agreed price is gone), and the mock refuses impossible / unconfirmed unusual amounts and audits confirmed ones.
import { AMOUNT_RANGES_USD, IMPOSSIBLE_FACTOR, amountRefusal, checkAmount, unusualNote, withUnusualConfirm } from '../src/amounts';
import { seedFxRates } from '../src/mock/seed';
import { demoSnapshot } from '../src/mock/db';
import { buildMoneyHistory } from '../src/mock/money-history';

let fails = 0;
const ok = (c: unknown, m: string, detail?: unknown) => { if (!c) { fails++; console.log('FAIL', m, detail === undefined ? '' : JSON.stringify(detail)?.slice(0, 400)); } else console.log('ok  ', m); };
const rates = seedFxRates();
const now = Date.now();

// ---- pure rules -------------------------------------------------------------------------------------------------------
let c = checkAmount('transport', 3_050_000, 'USD', rates, now);
ok(c.level === 'impossible' && c.direction === 'high' && c.looksLocal?.some((x) => x.currency === 'UGX'), 'USD 3,050,000 transport: impossible, looks like UGX entered as USD', c);
ok(/UGX 3,050,000 ≈ USD/.test(c.message) && /cannot be saved/.test(c.message), 'message names the converted local value', c.message);
c = checkAmount('transport', 3_050_000, 'UGX', rates, now);
ok(c.level === 'ok' && c.usd! > 700 && c.usd! < 900, 'UGX 3,050,000 transport ≈ USD 800: fine', c.usd);
c = checkAmount('transport', 150_000, 'USD', rates, now);
ok(c.level === 'unusual' && c.direction === 'high' && (c.looksLocal?.length ?? 0) > 0 && /local currency entered as USD/.test(c.message) && /Are you sure\?/.test(c.message), 'USD 150,000 transport: unusual, local-currency warning', c.message);
c = checkAmount('transport', 45_000, 'USD', rates, now);
ok(c.level === 'unusual' && !c.looksLocal?.length && /unusually high/.test(c.message), 'USD 45,000 transport: unusually high (no local hint below 100,000)', c.message);
c = checkAmount('transport', 50, 'USD', rates, now);
ok(c.level === 'unusual' && c.direction === 'low' && /unusually low/.test(c.message), 'USD 50 transport: unusually low', c.message);
c = checkAmount('transport', 200_000_000, 'UGX', rates, now);
ok(c.level === 'unusual' && /UGX 200,000,000 ≈ USD/.test(c.message), 'UGX 200,000,000: unusual, converted value shown', c.message);
ok(checkAmount('transport', 1500, undefined, rates).level === 'impossible' && checkAmount('transport', 1500, 'usd', rates).level === 'impossible' && checkAmount('transport', 1500, 'EUR', rates).level === 'impossible', 'currency must be explicit and known');
ok(checkAmount('payment', -5, 'USD', rates).level === 'impossible' && checkAmount('payment', 0, 'USD', rates).level === 'impossible' && checkAmount('payment', Number.NaN, 'USD', rates).level === 'impossible', 'negative / zero / not a number refused');
ok(checkAmount('trip-expense', AMOUNT_RANGES_USD['trip-expense'].max * IMPOSSIBLE_FACTOR + 1, 'USD', rates).level === 'impossible' && checkAmount('trip-expense', AMOUNT_RANGES_USD['trip-expense'].max * IMPOSSIBLE_FACTOR, 'USD', rates).level === 'unusual', `over ${IMPOSSIBLE_FACTOR}× the upper bound is impossible`);
ok(checkAmount('warehouse-expense', 141_800, 'RWF', rates).level === 'ok' && checkAmount('warehouse-expense', 30_000, 'USD', rates).level === 'unusual', 'warehouse expense ranges');
c = checkAmount('transport', 45_000, 'USD', rates);
ok(amountRefusal(c)?.code === 'unusual-amount' && amountRefusal(c, true) === null && amountRefusal(checkAmount('transport', 2e6, 'USD', rates), true)?.code === 'impossible-amount', 'refusal: unusual needs confirmUnusual, impossible never saves');
ok(/unusual amount confirmed/.test(unusualNote(c)) && unusualNote(checkAmount('transport', 1500, 'USD', rates)) === '', 'audit note only for confirmed unusual amounts');
{
  const calls: boolean[] = [];
  const save = async (confirm: boolean) => { calls.push(confirm); if (!confirm) throw Object.assign(new Error('unusual'), { code: 'unusual-amount' }); return 'saved'; };
  ok(await withUnusualConfirm(save, () => true) === 'saved' && calls.join() === 'false,true', 'screen helper: asks, then resends with confirmUnusual');
  ok(await withUnusualConfirm(save, () => false) === undefined, 'screen helper: "no" cancels the save');
}

// ---- seeded data (mock and pnpm db:seed share it) ------------------------------------------------------------------------
const snap = demoSnapshot();
buildMoneyHistory(snap as never);
const bad = (snap.costs ?? []).map((x) => ({ x, c: checkAmount(x.kind === 'Transport' ? 'transport' : 'trip-expense', x.amount, x.currency, rates, now) })).filter(({ c }) => c.level === 'impossible');
ok(bad.length === 0, 'no seeded trip cost is impossible', bad.slice(0, 3).map(({ x }) => x));
const transportUsd = (snap.costs ?? []).filter((x) => x.kind === 'Transport').map((x) => x.amountUsd ?? x.amount);
ok(transportUsd.every((v) => v <= AMOUNT_RANGES_USD.transport.max), 'every seeded agreed transport price is at most USD 20,000', Math.max(...transportUsd));
const ugx = (snap.costs ?? []).find((x) => x.kind === 'Transport' && x.amount === 3_050_000);
ok(ugx?.currency === 'UGX' && ugx.amountUsd! < 1000, 'the 3,050,000 agreed price is stored in UGX (≈ USD 800), not USD', ugx);
ok((snap.costs ?? []).filter((x) => x.kind === 'Transport' && x.docRef?.startsWith('Agreed at loading')).every((x) => {
  const sh = snap.shipments.find((s) => s.id === x.shipmentId); const ld = snap.loadings.find((l) => l.poId === sh?.poId && l.truckNo === sh?.truckNo);
  return !ld || ld.transportCurrency === x.currency;
}), 'every cost agreed at loading carries its loading\'s currency');
const xs = (snap as { expenses?: { amount: number; currency: string; date: string }[] }).expenses ?? [];
ok(xs.length > 0 && xs.every((x) => checkAmount('warehouse-expense', x.amount, x.currency, rates, x.date).level !== 'impossible'), 'no seeded warehouse expense is impossible', xs.length);

// ---- mock end to end ---------------------------------------------------------------------------------------------------
const api = await import('../src/index');
const st = (e: unknown) => `${(e as { status?: number }).status ?? ''} ${(e as { code?: string }).code ?? ''}`;
const rejects = async (p: Promise<unknown>, re: RegExp, m: string) => { try { await p; ok(false, `${m} (no error)`); } catch (e) { ok(re.test(`${st(e)} ${(e as Error).message}`), `${m} → ${st(e)}`); } };
api.demo.reset(); await api.ready();
await api.auth.login('u-daniel', ''); api.entities.setActive(null);
const fees = await api.finance.fees();
ok(fees.every((f) => f.agreedUsd === null || f.agreedUsd <= AMOUNT_RANGES_USD.transport.max), 'transport fees: no agreed price above USD 20,000', Math.max(...fees.map((f) => f.agreedUsd ?? 0)));
const open = fees.reduce((a, f) => a + (f.balanceUsd ?? 0), 0);
ok(open < 200_000, 'transport fees open balance is in the tens of thousands, not millions', Math.round(open));
const x = fees.find((f) => f.agreed?.amount === 3_050_000);
ok(x?.agreed?.currency === 'UGX', 'the Company X trip shows UGX 3,050,000', x?.agreed);

await api.auth.login('u-testfie', ''); api.entities.setActive(null);
const trip = (await api.finance.fees()).find((f) => f.status === 'Not recorded' && !f.reexport)!;
ok(!!trip, 'a trip without an agreed price to try on');
await rejects(api.finance.setAgreedPrice(trip.shipmentId, { amount: 3_050_000, currency: 'USD' }), /422 impossible-amount.*UGX/, 'USD 3,050,000 refused outright, suggests UGX');
await rejects(api.finance.setAgreedPrice(trip.shipmentId, { amount: 1500 }), /422 impossible-amount.*currency/, 'no currency → refused');
await rejects(api.finance.setAgreedPrice(trip.shipmentId, { amount: 45_000, currency: 'USD' }), /422 unusual-amount.*Are you sure/, 'USD 45,000 needs confirmation');
const saved = await api.finance.setAgreedPrice(trip.shipmentId, { amount: 45_000, currency: 'USD', confirmUnusual: true });
ok(saved.amount === 45_000 && saved.currency === 'USD', 'confirmed unusual price is saved');
await api.auth.login('u-daniel', ''); api.entities.setActive(null);
const audit = await api.audit.list({ q: 'unusual amount confirmed' });
ok(audit.rows.some((r) => r.recordId === trip.shipmentId), 'the confirmation is in the audit log', audit.rows.slice(0, 2));
await api.auth.login('u-testfie', ''); api.entities.setActive(null);
await rejects(api.finance.addCost({ shipmentId: trip.shipmentId, kind: 'Other', amount: 40_000, currency: 'USD' } as never), /422 unusual-amount/, 'trip expense USD 40,000 needs confirmation');
await api.auth.login('u-asie', ''); api.entities.setActive(null);
const today = new Date().toISOString().slice(0, 10);
await rejects(api.warehouse.addExpense({ warehouseId: 'w-kgl', date: today, category: 'Rent', amount: 5_000_000, currency: 'USD' }), /422 impossible-amount.*RWF/, 'warehouse expense USD 5,000,000 refused, suggests RWF');
const wx = await api.warehouse.addExpense({ warehouseId: 'w-kgl', date: today, category: 'Rent', amount: 5_000_000, currency: 'RWF' });
ok(wx.amountUsd > 2000 && wx.amountUsd < 5000, 'the same amount in RWF is a normal rent', wx.amountUsd);

if (fails) { console.log(`${fails} amount check(s) FAILED`); process.exit(1); }
console.log('all amount checks passed');
