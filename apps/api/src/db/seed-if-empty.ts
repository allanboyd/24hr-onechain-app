// Seeds the demo data only when the database has no users yet (used by the Docker entrypoint and `pnpm db:seed:if-empty`).
import { db, sqlClient } from './client';
import { seedDemo } from './seed';

(async () => {
  const [{ n }] = await sqlClient<{ n: number }[]>`select count(*)::int as n from users`;
  if (n === 0) console.log('▸ Seeding demo data (empty database)', await seedDemo(db));
  else console.log(`▸ Demo data present (${n} users) — set SEED=reset to reseed`);
  await sqlClient.end();
})().catch((e) => { console.error(e); process.exit(1); });
