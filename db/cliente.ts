import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as esquema from './esquema';

/**
 * Demo: Postgres embebido en el proceso (PGlite), sin servidor de base. Cada
 * instancia arranca desde demo/base.tar.gz, que arma el build con los datos de
 * prueba; lo que se cambie vive en memoria hasta que la instancia se apaga.
 * PGlite encola las consultas hasta terminar de cargar, así que `db` se puede
 * usar desde el primer momento.
 */

const global_ = globalThis as unknown as { baseDemo?: PGlite; instanciaDemo?: string };

export const base =
  global_.baseDemo ??
  new PGlite({ loadDataDir: new Blob([readFileSync(path.join(process.cwd(), 'demo/base.tar.gz'))]) });
global_.baseDemo = base;

/**
 * Cambia cada vez que arranca una base nueva. Los navegadores la comparan con
 * la que conocían: si es otra, tiran su copia del salón, que hablaba de una
 * base que ya no existe.
 */
export const instanciaBase = (global_.instanciaDemo ??= crypto.randomUUID());

export const db = drizzle(base, { schema: esquema });

/**
 * El último evento de los datos de prueba, leído antes de cualquier escritura:
 * lo que viene después lo creó alguien en esta instancia. Un navegador que
 * llega con eventos propios posteriores a éste los vuelve a mandar.
 */
type GlobalBase = { secuenciaBaseDemo?: Promise<number> };
export const secuenciaBase = ((globalThis as GlobalBase).secuenciaBaseDemo ??= base
  .query<{ max: number | null }>('select max(secuencia)::int as max from eventos')
  .then((r) => r.rows[0]?.max ?? 0));
