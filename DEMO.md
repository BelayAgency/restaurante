# Demo en Vercel (rama `demo-vercel`)

Esta rama es una demo pública con datos de prueba: octubre 2026 con cajas, mesas, cobros y
compras. No es producción: producción es `main`, que despliega el panel de Belay en su servidor.

## Entrar

Usuario `admin`, contraseña `admin`. Entra como el dueño, con el selector «Vista» para ver el
sistema como cada rol.

## Ponerla en marcha (una sola vez)

1. **Proyecto en Vercel**: *Add New → Project* → importar `BelayAgency/restaurante`.
2. **Rama**: en *Settings → Git*, *Production Branch* = `demo-vercel`. En *Settings → Git →
   Ignored Build Step*, elegir *Custom* con:
   `if [ "$VERCEL_GIT_COMMIT_REF" = "demo-vercel" ]; then exit 1; else exit 0; fi`
   — así un push a `main` no intenta desplegarse también en Vercel.
3. **Base de datos**: en *Storage*, conectar **Neon** (Postgres gratis del Marketplace) al
   proyecto. Deja solas `DATABASE_URL` y `DATABASE_URL_UNPOOLED`.
4. **Secreto de sesión**: en *Settings → Environment Variables*, `BETTER_AUTH_SECRET` con un valor
   largo al azar (`openssl rand -base64 48`).
5. **Deploy**. El build (`vercel-build`) migra la base, la llena con los datos de prueba si está
   vacía y compila. `BETTER_AUTH_URL` no hace falta: toma la URL del proyecto.

## Cómo está armada

- `demo/datos.sql`: volcado de la base local sin auditoría, sesiones, credenciales ni las facturas
  reales del cliente.
- `demo/compras.sql`: facturas y pagos inventados, con los nombres reales de los proveedores.
- `scripts/cargar-demo.ts`: carga los dos archivos sólo si la base no tiene usuarios, y guarda la
  contraseña `admin`. Los deploys siguientes no tocan lo que se haya cargado probando.
- Para volver a los datos de prueba originales: borrar la base en Neon (o crear otra rama de base)
  y redeployar.
