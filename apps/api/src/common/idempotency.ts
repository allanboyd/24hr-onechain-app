import { and, eq } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import { fail } from './errors';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * S-3: apply a write once per key. The key is claimed first (a 'pending' row) so two concurrent submits of the same
 * outbox item cannot both apply it; the loser waits for the winner and returns its stored result. Keys belong to the
 * user who first sent them — another user's key is refused and never returns their stored result.
 */
export async function once<T>(key: string | undefined, userId: string, op: string, fn: () => Promise<T>): Promise<{ status: 'applied' | 'duplicate'; result: T }> {
  if (!key) return { status: 'applied', result: await fn() };
  if (typeof key !== 'string' || key.length > 100) fail('Invalid idempotency key', 400, 'bad-request');
  const claimed = await db.insert(t.idempotencyKeys).values({ key, userId, op, status: 'pending', response: null as never }).onConflictDoNothing().returning({ key: t.idempotencyKeys.key });
  if (!claimed.length) {
    for (let i = 0; i < 50; i++) {
      const [prev] = await db.select().from(t.idempotencyKeys).where(eq(t.idempotencyKeys.key, key));
      if (!prev) return once(key, userId, op, fn); // the earlier attempt crashed and released the key
      if (prev.userId !== userId) fail('This idempotency key was already used by another user', 409, 'idempotency-conflict');
      if (prev.status === 'rejected') throw Object.assign(new Error(String((prev.response as { message?: string })?.message ?? 'Rejected earlier')), { duplicate: true, getStatus: () => Number((prev.response as { status?: number })?.status ?? 422) });
      if (prev.status === 'applied') return { status: 'duplicate', result: prev.response as T };
      await sleep(100); // pending: the first submit is still running
    }
    fail('The same request is still being processed — try again', 409, 'in-progress');
  }
  try {
    const result = await fn();
    await db.update(t.idempotencyKeys).set({ status: 'applied', response: (result ?? null) as never }).where(and(eq(t.idempotencyKeys.key, key), eq(t.idempotencyKeys.userId, userId)));
    return { status: 'applied', result };
  } catch (e) {
    const status = typeof (e as { getStatus?: () => number }).getStatus === 'function' ? (e as { getStatus: () => number }).getStatus() : 422;
    if (status >= 400 && status < 500) await db.update(t.idempotencyKeys).set({ status: 'rejected', response: { message: (e as Error).message, status } }).where(eq(t.idempotencyKeys.key, key));
    else await db.delete(t.idempotencyKeys).where(eq(t.idempotencyKeys.key, key)); // server error: let the client retry
    throw e;
  }
}
