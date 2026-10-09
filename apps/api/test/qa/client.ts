// The shared HTTP client (@btw/api/http) against the server: logout semantics and device ids.
import * as api from '@btw/api/http';
import { client, expectStatus, ok, section, type Env } from './harness';

export async function clientSuite(env: Env) {
  section('Client · web sign-out / sign-in race (fixed bug)');
  api.configure({ baseUrl: env.base, channel: 'web' });
  await api.auth.signIn({ username: 'acc', password: 'demo1234' });
  const first = (globalThis as any).__btwLastSession ?? null; void first;
  const p = api.auth.logout();
  ok(p && typeof (p as Promise<void>).then === 'function', 'auth.logout() returns a promise');
  // sign in again immediately, before the logout request has finished (the old bug: the late revoke killed this session)
  await api.auth.signIn({ username: 'acc', password: 'demo1234' });
  await p;
  const trips = await api.finance.trips().then(() => 'ok', (e) => String(e?.status ?? e));
  ok(trips === 'ok', 'the new session still works after the earlier logout completes', trips);
  await api.auth.logout();

  section('Server · user admin and error hygiene (fixed bugs)');
  const c = client(env.base);
  const dir = (await c.login('dir')).accessToken;
  const a = await c.req('POST', '/users', { token: dir, body: { name: 'Grace Achieng', phone: '+254798000001', roles: ['receiver'], warehouseIds: ['w-kgl'] } });
  const b = await c.req('POST', '/users', { token: dir, body: { name: 'Grace Wanjiru', phone: '+254798000002', roles: ['receiver'], warehouseIds: ['w-kgl'] } });
  ok(a.status === 201 && b.status === 201 && a.body.username === 'grace' && b.body.username === 'grace2', 'two users with the same first name get unique usernames', [a.body.username, b.body.username]);
  const clash = await c.req('POST', '/users', { token: dir, body: { name: 'X', username: 'grace', phone: '+254798000003', roles: ['receiver'] } });
  ok(clash.status === 409 && !/insert into|select |Failed query/i.test(JSON.stringify(clash.body)), 'explicit duplicate username → 409 without SQL in the response', clash.body);
  const dupPhone = await c.req('POST', '/users', { token: dir, body: { name: 'Y', phone: '+254798000001', roles: ['receiver'] } });
  expectStatus(dupPhone, 409, 'duplicate phone → 409');
}
