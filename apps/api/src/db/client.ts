import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/config';
import * as schema from './schema';

// Safety net: a transaction left idle (e.g. waiting on something outside the database) is ended by Postgres
// instead of holding locks and a pool slot forever.
const conn = { idle_in_transaction_session_timeout: 30_000 };
export const sqlClient = postgres(config.DATABASE_URL, { max: config.DB_POOL, onnotice: () => {}, connection: conn });
export const db = drizzle(sqlClient, { schema });
/** Separate small pool for the master-data cache. Transactions call RefService while holding a main-pool connection;
 *  loading the cache from that same pool deadlocked the API under load (all slots held, each waiting on the cache). */
export const refDb = drizzle(postgres(config.DATABASE_URL, { max: 2, onnotice: () => {}, connection: conn }), { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export { schema };
