import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { urlPruebas } from './pruebas/base-pruebas';

// Contra el Postgres de desarrollo (`docker compose up -d`), pero en una base
// aparte que se crea y se migra sola.
process.loadEnvFile('.env');
process.env.DATABASE_URL = urlPruebas(process.env.DATABASE_URL!);

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'server-only': path.resolve(__dirname, 'pruebas/server-only.ts'),
    },
  },
  test: {
    include: ['**/*.integracion.test.ts'],
    exclude: ['node_modules/**', '.claude/**', '.next/**'],
    globalSetup: ['pruebas/base-pruebas.ts'],
    env: { DATABASE_URL: process.env.DATABASE_URL },
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
