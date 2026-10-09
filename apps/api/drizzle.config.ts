import { defineConfig } from 'drizzle-kit';
export default defineConfig({ schema: './src/db/schema.ts', out: './drizzle', dialect: 'postgresql', dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://btw:btw@localhost:55433/btw' } });
