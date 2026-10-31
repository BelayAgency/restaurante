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
