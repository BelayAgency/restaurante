import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hash } from '@node-rs/argon2';
import { Client } from 'pg';

/**
 * Sólo para la rama de demo: con la base recién migrada y vacía, la llena con
 * los datos de prueba (demo/datos.sql) y las facturas inventadas
 * (demo/compras.sql), y deja la cuenta de dueño con usuario «admin» y
 * contraseña «admin». Si la base ya tiene usuarios no toca nada: cada deploy
 * corre esto, y lo que se haya cargado probando la demo se conserva.
 */

const CONTRASENA_DEMO = 'admin';
const EMAIL_ADMIN = 'info@belay.agency';

async function cargar(): Promise<void> {
  // Directa y no por el pooler: un volcado son miles de sentencias en una sola transacción.
  const cliente = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  await cliente.connect();
  try {
    const { rows } = await cliente.query<{ cantidad: string }>('select count(*) as cantidad from usuarios');
    if (Number(rows[0]?.cantidad) > 0) {
      console.log('[demo] la base ya tiene datos, no se toca');
      return;
    }
    const leer = (archivo: string) => readFileSync(path.join(process.cwd(), 'demo', archivo), 'utf8');
    await cliente.query('begin');
    // Las migraciones dejan medios de pago, depósitos y motivos con ids propios; el volcado
    // trae los mismos con los ids que nombran los eventos.
    await cliente.query('delete from configuracion_control; delete from motivos_autorizacion; delete from depositos; delete from medios_pago;');
    await cliente.query(leer('datos.sql'));
    // El volcado de pg_dump deja la sesión con search_path vacío: sin volver a public, lo que
    // sigue no encuentra las tablas.
    await cliente.query("select pg_catalog.set_config('search_path', 'public', false)");
    await cliente.query(leer('compras.sql'));
    const { rows: admin } = await cliente.query<{ id: string }>('select id from usuarios where email = $1', [EMAIL_ADMIN]);
    if (!admin[0]) throw new Error('El volcado no trae la cuenta de dueño de la demo');
    await cliente.query(
      `insert into cuentas_auth (id, id_cuenta, id_proveedor, usuario_id, contrasena, creado_en, actualizado_en)
       values (gen_random_uuid()::text, $1, 'credential', $1, $2, now(), now())`,
      [admin[0].id, await hash(CONTRASENA_DEMO)],
    );
    await cliente.query('commit');
    console.log('[demo] datos de prueba cargados; entrar con admin / admin');
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await cliente.end();
  }
}

cargar().catch((error: unknown) => {
  console.error('[demo] falló la carga', error);
  process.exit(1);
});
