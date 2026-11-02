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
// El último día completo de los datos de prueba es el 28/10/2026. Se corren todas sus fechas
// para que ese día sea ayer (hora de Buenos Aires): en cualquier momento que se arme la demo,
// el mes en curso y el anterior tienen movimiento. Se corren días enteros: las horas no cambian.
const ULTIMO_DIA_DE_PRUEBA = Date.UTC(2026, 9, 28);
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const corrimiento = Math.max(0, Math.round((Date.parse(`${hoy}T00:00:00Z`) - 86_400_000 - ULTIMO_DIA_DE_PRUEBA) / 86_400_000));
const correr = (texto) =>
  corrimiento
    ? texto.replace(/(?<![\w-])20\d\d-\d\d-\d\d(?![\w-])/g, (fecha) => new Date(Date.parse(`${fecha}T00:00:00Z`) + corrimiento * 86_400_000).toISOString().slice(0, 10))
    : texto;
const leer = (archivo) => correr(readFileSync(path.join(raiz, 'demo', archivo), 'utf8'));

// Las primeras pruebas del sistema (una caja y unas mesas que abrió soporte el 29 y 30/10) no son
// datos de prueba: corridas, caerían hoy y mañana. Se sacan las cuentas y cajas que abrió soporte,
// con todos sus eventos (también el cobro y el cierre que las cerraron).
const SOPORTE = '1d54a85d-2563-4896-b642-bac0ee1fd9dd';
const filaEvento = /^\t\('[^']*', \d+, '([a-z_]+)', \d+, '[a-z]+', '([0-9a-f-]{36})', '\{.*?\}', '([^']+)'/;
function sinPruebasDeSoporte(texto) {
  const lineas = texto.split('\n');
  const deSoporte = new Set();
  for (const linea of lineas) {
    const m = filaEvento.exec(linea);
    if (m && (m[1] === 'cuenta_abierta' || m[1] === 'turno_abierto') && m[3] === SOPORTE) deSoporte.add(m[2]);
  }
  const salida = [];
  for (const linea of lineas) {
    const m = filaEvento.exec(linea);
    // Los datos de prueba los hizo el equipo de muestra: nada de soporte es parte de ellos.
    if (m && (deSoporte.has(m[2]) || m[3] === SOPORTE)) {
      // Si era la última fila de un INSERT, el punto y coma pasa a la anterior.
      if (linea.trimEnd().endsWith(');') && salida.at(-1)?.trimEnd().endsWith('),')) salida[salida.length - 1] = salida.at(-1).trimEnd().replace(/,$/, ';');
      continue;
    }
    salida.push(linea);
  }
  console.log(`[demo] fuera ${deSoporte.size} cuentas y cajas de las pruebas de soporte`);
  return salida.join('\n');
}

const base = new PGlite();
await migrate(drizzle(base), { migrationsFolder: path.join(raiz, 'db/migraciones') });

// Las migraciones dejan medios de pago, depósitos y motivos con ids propios; el
// volcado trae los mismos con los ids que nombran los eventos.
await base.exec('delete from configuracion_control; delete from motivos_autorizacion; delete from depositos; delete from medios_pago;');
await base.exec(sinPruebasDeSoporte(leer('datos.sql')));
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
console.log(`[demo] datos corridos ${corrimiento} días`);
console.log(`[demo] base armada: ${(archivo.size / 1024 / 1024).toFixed(1)} MB; entrar con admin / admin (dueño) o con soporte`);
