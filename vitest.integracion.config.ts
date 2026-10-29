import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Contra la base de desarrollo: `docker compose up -d` y `npm run db:migrar` antes.
process.loadEnvFile('.env');

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'server-only': path.resolve(__dirname, 'pruebas/server-only.ts'),
    },
  },
  test: { include: ['**/*.integracion.test.ts'], exclude: ['node_modules/**', '.claude/**', '.next/**'], fileParallelism: false, testTimeout: 30_000 },
});
