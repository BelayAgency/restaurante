import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/esquema.ts',
  out: './db/migraciones',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
});
