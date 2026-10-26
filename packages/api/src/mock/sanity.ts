// docs/17 F4: the mock applies the same amount sanity rules as the server (packages/api/src/amounts.ts). Lazy chunk.
import { amountRefusal, checkAmount, unusualNote, type AmountKind } from '../amounts';
import * as m from './db';
import * as seed from './seed';

export function mockSane(kind: AmountKind, amount: unknown, currency: unknown, at: string | number, confirmUnusual?: unknown) {
  const check = checkAmount(kind, amount, currency, m.db.fxRates ?? seed.seedFxRates(), at);
  const r = amountRefusal(check, confirmUnusual);
  if (r) throw Object.assign(new Error(r.message), { status: r.status, code: r.code, amountCheck: check });
  return { check, note: unusualNote(check) };
}
