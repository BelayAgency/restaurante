import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { cuentasAuth, usuarios } from '../db/esquema';

// Una sola vez, con la base vacía o sin soporte. En producción la contraseña
// se cambia a mano después del primer deploy por la del gestor de la agencia.
const EMAIL = 'info@belay.agency';
const CONTRASENA_INICIAL = 'Soporte2026!';

async function sembrar(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const db = drizzle(pool);
  try {
    const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, EMAIL));
    if (existente) {
      console.log('[sembrar] soporte ya existe, no se toca');
      return;
    }
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(usuarios).values({ id, nombre: 'Soporte Belay', email: EMAIL, rol: 'dueno', esSoporte: true, emailVerificado: true });
      await tx.insert(cuentasAuth).values({
        id: crypto.randomUUID(),
        idCuenta: id,
        idProveedor: 'credential',
        usuarioId: id,
        contrasena: await hash(CONTRASENA_INICIAL),
      });
    });
    console.log('[sembrar] soporte creado');
  } finally {
    await pool.end();
  }
}

sembrar().catch((error: unknown) => {
  console.error('[sembrar] falló', error);
  process.exit(1);
});
