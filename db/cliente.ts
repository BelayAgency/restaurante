import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as esquema from './esquema';

// Una sola pool por proceso: en dev, el recargado en caliente reevalúa el
// módulo y sin esto se abren conexiones nuevas en cada guardado.
const global_ = globalThis as unknown as { poolRestaurante?: Pool };

const pool =
  global_.poolRestaurante ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

if (process.env.NODE_ENV !== 'production') global_.poolRestaurante = pool;

export const db = drizzle(pool, { schema: esquema });
