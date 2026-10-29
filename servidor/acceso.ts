import 'server-only';
import { headers } from 'next/headers';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { codigosVerificacion, intentosAcceso, usuarios } from '@/db/esquema';
import { enviarMail, MailNoEnviado } from '@/lib/mails/panel';
import { auth } from './auth';
import { crearCodigo, marcarUsado, MINUTOS_CODIGO, probarCodigo, codigoVigente, MAX_INTENTOS_CODIGO } from './codigos';
import { cambiarContrasena } from './credenciales';
import { dentroDelLimite } from './limite';

const MAX_FALLIDOS = 5;
const MINUTOS_BLOQUEO = 15;
export const SEGUNDOS_REENVIO = 60;

export type ResultadoEntrar =
  | { ok: true }
  | { ok: false; motivo: 'credenciales'; intentosRestantes: number }
  | { ok: false; motivo: 'bloqueada'; minutos: number }
  | { ok: false; motivo: 'limite' };

/**
 * El único camino de entrada. El contador va por dirección exista o no la
 * cuenta, así "te quedan N intentos" no distingue una dirección real de una
 * inventada.
 */
export async function entrar(email: string, contrasena: string, mantener: boolean, ip: string | null): Promise<ResultadoEntrar> {
  if (!dentroDelLimite(`entrar:ip:${ip ?? '?'}`, 30, 60_000)) return { ok: false, motivo: 'limite' };

  const previo = await db.query.intentosAcceso.findFirst({ where: eq(intentosAcceso.email, email) });
  if (previo?.bloqueadoHasta && previo.bloqueadoHasta > new Date()) {
    return { ok: false, motivo: 'bloqueada', minutos: Math.ceil((previo.bloqueadoHasta.getTime() - Date.now()) / 60_000) };
  }

  let entro = false;
  try {
    await auth.api.signInEmail({ body: { email, password: contrasena, rememberMe: mantener }, headers: await headers() });
    entro = true;
  } catch {
    // Contraseña mal, cuenta inexistente o desactivada: para afuera es lo mismo.
  }

  if (entro) {
    await db.delete(intentosAcceso).where(eq(intentosAcceso.email, email));
    return { ok: true };
  }

  const fallidos = (previo?.bloqueadoHasta ? 0 : (previo?.fallidos ?? 0)) + 1;
  const bloquear = fallidos >= MAX_FALLIDOS;
  const fila = {
    email,
    fallidos: bloquear ? 0 : fallidos,
    bloqueadoHasta: bloquear ? new Date(Date.now() + MINUTOS_BLOQUEO * 60_000) : null,
    actualizadoEn: new Date(),
  };
  await db.insert(intentosAcceso).values(fila).onConflictDoUpdate({ target: intentosAcceso.email, set: fila });

  if (bloquear) return { ok: false, motivo: 'bloqueada', minutos: MINUTOS_BLOQUEO };
  return { ok: false, motivo: 'credenciales', intentosRestantes: MAX_FALLIDOS - fallidos };
}

export type ResultadoPedirCodigo = { ok: true } | { ok: false; motivo: 'limite' | 'sin_envio' };

/**
 * Pantalla 2. Contesta lo mismo exista o no la cuenta. La única diferencia
 * posible es cuando el mail no sale: decir "revisá tu correo" sobre algo que
 * no va a llegar deja a alguien esperando, y eso pesa más.
 */
export async function pedirCodigoRecuperacion(email: string, ip: string | null): Promise<ResultadoPedirCodigo> {
  if (!dentroDelLimite(`recuperar:ip:${ip ?? '?'}`, 10, 15 * 60_000)) return { ok: false, motivo: 'limite' };
  if (!dentroDelLimite(`recuperar:email:${email}`, 3, 15 * 60_000)) return { ok: false, motivo: 'limite' };

  const usuario = await db.query.usuarios.findFirst({ where: eq(usuarios.email, email) });
  if (!usuario?.activo) return { ok: true };

  const { id, codigo } = await crearCodigo({ usuarioId: usuario.id, proposito: 'recuperacion', destinatario: usuario.email, solicitadoPorId: null });
  try {
    await enviarMail('recuperacion-contrasena', usuario.email, { codigo, minutos: MINUTOS_CODIGO });
  } catch (error) {
    if (!(error instanceof MailNoEnviado)) throw error;
    await db.delete(codigosVerificacion).where(eq(codigosVerificacion.id, id)).catch(() => undefined);
    return { ok: false, motivo: 'sin_envio' };
  }
  return { ok: true };
}

async function ultimoCodigoRecuperacion(email: string) {
  const [fila] = await db
    .select({ codigo: codigosVerificacion })
    .from(codigosVerificacion)
    .innerJoin(usuarios, eq(usuarios.id, codigosVerificacion.usuarioId))
    .where(and(eq(usuarios.email, email), eq(codigosVerificacion.proposito, 'recuperacion'), eq(usuarios.activo, true)))
    .orderBy(desc(codigosVerificacion.creadoEn))
    .limit(1);
  return fila?.codigo;
}

export type ResultadoVerificar =
  | { ok: true }
  | { ok: false; motivo: 'codigo'; intentosRestantes: number }
  | { ok: false; motivo: 'vencido' | 'limite' };

// Para una dirección sin cuenta no hay fila que cuente intentos; se cuentan
// acá para que la respuesta sea la misma que con una cuenta real.
const intentosSinCuenta = new Map<string, number>();

export async function verificarCodigoRecuperacion(email: string, codigo: string, ip: string | null): Promise<ResultadoVerificar> {
  if (!dentroDelLimite(`codigo:ip:${ip ?? '?'}`, 20, 15 * 60_000)) return { ok: false, motivo: 'limite' };

  const fila = await ultimoCodigoRecuperacion(email);
  if (!fila) {
    const intentos = (intentosSinCuenta.get(email) ?? 0) + 1;
    intentosSinCuenta.set(email, intentos);
    if (intentosSinCuenta.size > 5_000) intentosSinCuenta.clear();
    const restantes = MAX_INTENTOS_CODIGO - intentos;
    return restantes > 0 ? { ok: false, motivo: 'codigo', intentosRestantes: restantes } : { ok: false, motivo: 'vencido' };
  }

  const resultado = await probarCodigo(fila, codigo);
  if (resultado.ok) return { ok: true };
  return resultado.vencido ? { ok: false, motivo: 'vencido' } : { ok: false, motivo: 'codigo', intentosRestantes: resultado.intentosRestantes };
}

export type ResultadoRestablecer = { ok: true } | { ok: false; motivo: 'vencido' | 'contrasena' };

/** Pantalla 4: "Guardar y entrar". Cierra todas las sesiones de la cuenta y abre una nueva acá. */
export async function restablecerContrasena(email: string, codigo: string, nueva: string, ip: string | null): Promise<ResultadoRestablecer> {
  const fila = await ultimoCodigoRecuperacion(email);
  if (!codigoVigente(fila) || !fila.verificadoEn) return { ok: false, motivo: 'vencido' };
  const resultado = await probarCodigo(fila, codigo);
  if (!resultado.ok) return { ok: false, motivo: 'vencido' };

  try {
    await cambiarContrasena(fila.usuarioId, nueva, null, ip);
  } catch {
    return { ok: false, motivo: 'contrasena' };
  }
  await marcarUsado(fila.id);
  await db.delete(intentosAcceso).where(eq(intentosAcceso.email, email));
  await auth.api.signInEmail({ body: { email, password: nueva, rememberMe: false }, headers: await headers() }).catch(() => undefined);
  return { ok: true };
}
