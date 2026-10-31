// Sólo para la demo: arma la base completa en el build, sin servidor de Postgres.
// Corre las migraciones en un PGlite vacío, carga los datos de prueba y las
// facturas inventadas, deja las dos cuentas para entrar y guarda el resultado
// en demo/base.tar.gz. En Vercel cada instancia arranca desde ese archivo.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { hash } from '@node-rs/argon2';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const raiz = process.cwd();
const leer = (archivo) => readFileSync(path.join(raiz, 'demo', archivo), 'utf8');

const base = new PGlite();
await migrate(drizzle(base), { migrationsFolder: path.join(raiz, 'db/migraciones') });

// Las migraciones dejan medios de pago, depósitos y motivos con ids propios; el
// volcado trae los mismos con los ids que nombran los eventos.
await base.exec('delete from configuracion_control; delete from motivos_autorizacion; delete from depositos; delete from medios_pago;');
await base.exec(leer('datos.sql'));
// El volcado deja la sesión con search_path vacío.
await base.exec("select pg_catalog.set_config('search_path', 'public', false)");
await base.exec(leer('compras.sql'));

// El volcado no trae credenciales. «admin» entra como el dueño de muestra; soporte, con su mail
// y la contraseña del seed, y con su nombre de siempre (en la base local se renombró).
await base.query("update usuarios set nombre = 'Soporte Belay' where email = 'info@belay.agency'");
const cuentas = [
  ['martin.gomez@ejemplo.com', 'admin'],
  ['info@belay.agency', 'Soporte2026!'],
];
for (const [email, contrasena] of cuentas) {
  const { rows } = await base.query('select id from usuarios where email = $1', [email]);
  if (!rows[0]) throw new Error(`El volcado no trae la cuenta ${email}`);
  await base.query(
    `insert into cuentas_auth (id, id_cuenta, id_proveedor, usuario_id, contrasena, creado_en, actualizado_en)
     values (gen_random_uuid()::text, $1, 'credential', $1, $2, now(), now())`,
    [rows[0].id, await hash(contrasena)],
  );
}

const archivo = await base.dumpDataDir('gzip');
writeFileSync(path.join(raiz, 'demo/base.tar.gz'), Buffer.from(await archivo.arrayBuffer()));
await base.close();
console.log(`[demo] base armada: ${(archivo.size / 1024 / 1024).toFixed(1)} MB; entrar con admin / admin (dueño) o con soporte`);
