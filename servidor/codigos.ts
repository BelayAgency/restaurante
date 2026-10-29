import 'server-only';
import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { codigosVerificacion } from '@/db/esquema';

export const MINUTOS_CODIGO = 15;
export const MAX_INTENTOS_CODIGO = 5;

export type PropositoCodigo = (typeof codigosVerificacion.$inferSelect)['proposito'];

/** Crea un código nuevo y mata los anteriores del mismo propósito: vale sólo el último que llegó. */
export async function crearCodigo(datos: {
  usuarioId: string;
  proposito: PropositoCodigo;
  destinatario: string;
  solicitadoPorId: string | null;
}): Promise<{ id: string; codigo: string }> {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codigoHash = await hash(codigo);
  const id = await db.transaction(async (tx) => {
    await anularCodigos(datos.usuarioId, datos.proposito, tx);
    const [fila] = await tx
      .insert(codigosVerificacion)
      .values({ ...datos, codigoHash, venceEn: new Date(Date.now() + MINUTOS_CODIGO * 60_000) })
      .returning({ id: codigosVerificacion.id });
    return fila!.id;
  });
  return { id, codigo };
}

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function anularCodigos(usuarioId: string, proposito?: PropositoCodigo, tx: Transaccion | typeof db = db) {
  await tx
    .update(codigosVerificacion)
    .set({ anuladoEn: new Date() })
    .where(
      and(
        eq(codigosVerificacion.usuarioId, usuarioId),
        proposito ? eq(codigosVerificacion.proposito, proposito) : undefined,
        isNull(codigosVerificacion.usadoEn),
        isNull(codigosVerificacion.anuladoEn),
      ),
    );
}

export type FilaCodigo = typeof codigosVerificacion.$inferSelect;

export function codigoVigente(fila: FilaCodigo | undefined): fila is FilaCodigo {
  return !!fila && !fila.usadoEn && !fila.anuladoEn && fila.venceEn > new Date() && fila.intentos < MAX_INTENTOS_CODIGO;
}

export type ResultadoCodigo = { ok: true } | { ok: false; vencido: boolean; intentosRestantes: number };

/**
 * Compara el código. Un acierto lo marca verificado (el paso siguiente pide
 * el valor nuevo y lo vuelve a presentar); un error suma un intento, y al
 * quinto el código muere.
 */
export async function probarCodigo(fila: FilaCodigo | undefined, codigo: string): Promise<ResultadoCodigo> {
  if (!codigoVigente(fila)) return { ok: false, vencido: true, intentosRestantes: 0 };
  if (/^[0-9]{6}$/.test(codigo) && (await verify(fila.codigoHash, codigo))) {
    if (!fila.verificadoEn) {
      await db.update(codigosVerificacion).set({ verificadoEn: new Date() }).where(eq(codigosVerificacion.id, fila.id));
    }
    return { ok: true };
  }
  const intentos = fila.intentos + 1;
  await db.update(codigosVerificacion).set({ intentos }).where(eq(codigosVerificacion.id, fila.id));
  const intentosRestantes = MAX_INTENTOS_CODIGO - intentos;
  return { ok: false, vencido: intentosRestantes <= 0, intentosRestantes };
}

export async function marcarUsado(id: string) {
  await db.update(codigosVerificacion).set({ usadoEn: new Date() }).where(eq(codigosVerificacion.id, id));
}

export async function borrarCodigo(id: string) {
  await db.update(codigosVerificacion).set({ anuladoEn: new Date() }).where(eq(codigosVerificacion.id, id));
}
