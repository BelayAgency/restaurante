import { existsSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { urlBase } from '../db/url';

const carpeta = process.env.CARPETA_MIGRACIONES ?? path.join(process.cwd(), 'db/migraciones');

async function migrar(): Promise<void> {
  if (!existsSync(path.join(carpeta, 'meta/_journal.json'))) {
    console.log('[migrar] no hay migraciones todavía');
    return;
  }
  const pool = new Pool({ connectionString: urlBase({ directa: true }), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: carpeta });
    console.log('[migrar] base al día');
  } finally {
    await pool.end();
  }
}

migrar().catch((error: unknown) => {
  console.error('[migrar] falló', error);
  process.exit(1);
});
