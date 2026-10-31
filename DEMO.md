# Demo en Vercel (rama `demo-vercel`)

Demo pública con datos de prueba (octubre 2026: cajas, mesas, cobros, compras). No es
producción: producción es `main`, que despliega el panel de Belay en su servidor.

## Entrar

Usuario `admin`, contraseña `admin`. Entra como el dueño, con el selector «Vista» para ver el
sistema como cada rol.

## Ponerla en marcha (una sola vez)

1. **Proyecto en Vercel** importando `BelayAgency/restaurante`.
2. **Settings → Git**: *Production Branch* = `demo-vercel`.
3. **Settings → Environment Variables**: `BETTER_AUTH_SECRET` con un valor largo al azar
   (`openssl rand -base64 48`), en Production y Preview.
4. **Deploy.** No hace falta ninguna base: no conectar Neon.

## Cómo está armada

- **Sin servidor de base.** El build (`scripts/armar-demo.mjs`) corre las migraciones en
  PGlite (Postgres compilado a WebAssembly), carga `demo/datos.sql` y `demo/compras.sql`, deja
  la cuenta `admin` y guarda todo en `demo/base.tar.gz`. Cada instancia de Vercel arranca desde
  ese archivo y trabaja en memoria.
- **Lo que se cambie** dura mientras la instancia esté viva y lo ve cualquiera que entre.
  Cuando Vercel la apaga (un rato sin uso, o un deploy nuevo), todo vuelve a los datos de prueba:
  pide entrar de nuevo con `admin`, y el navegador tira su copia del salón y la vuelve a traer.
- `demo/datos.sql`: volcado de la base local sin auditoría, sesiones, credenciales ni las
  facturas reales del cliente. `demo/compras.sql`: facturas y pagos inventados con los nombres
  reales de los proveedores.
