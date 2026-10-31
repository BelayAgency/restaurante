import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as esquema from './esquema';

// Una sola pool por proceso: en dev, el recargado en caliente reevalúa el
// módulo y sin esto se abren conexiones nuevas en cada guardado.
const global_ = globalThis as unknown as { poolRestaurante?: Pool };

const pool =
  global_.poolRestaurante ??
  // En Vercel cada función es un proceso aparte: con 10 por cada una se agota enseguida el
  // tope de conexiones de la base gratuita. Ahí va por el pooler de Neon, con pocas.
  new Pool({ connectionString: process.env.DATABASE_URL, max: process.env.VERCEL ? 3 : 10 });

if (process.env.NODE_ENV !== 'production') global_.poolRestaurante = pool;

export const db = drizzle(pool, { schema: esquema });
