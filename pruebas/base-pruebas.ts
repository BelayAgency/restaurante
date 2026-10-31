import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';

// Los tests de integración crean usuarios, sectores y eventos que no se pueden
// borrar (los eventos son inmutables). Contra la base de desarrollo, cada
// corrida dejaba mesas y sectores de prueba en el salón; van a una base propia.
export function urlPruebas(urlDesarrollo: string): string {
  const url = new URL(urlDesarrollo);
  url.pathname = `${url.pathname.slice(1)}_pruebas`;
  return url.toString();
}

export default async function prepararBase() {
  const destino = new URL(process.env.DATABASE_URL!);
  const nombre = destino.pathname.slice(1);
  const mantenimiento = new URL(destino);
  mantenimiento.pathname = '/postgres';

  const cliente = new Client({ connectionString: mantenimiento.toString() });
  await cliente.connect();
  try {
    const { rowCount } = await cliente.query('select 1 from pg_database where datname = $1', [nombre]);
    if (!rowCount) await cliente.query(`create database "${nombre}"`);
  } finally {
    await cliente.end();
  }

  const pool = new Pool({ connectionString: destino.toString(), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.join(process.cwd(), 'db/migraciones') });
  } finally {
    await pool.end();
  }
}
