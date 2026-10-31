import 'server-only';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { diasOperativos, eventos } from '@/db/esquema';
import type { EventoNuevo } from '@/dominio/eventos';
import { reducirCaja } from '@/dominio/reductores/caja';

export interface DiaAbierto {
  id: string;
  abiertoEn: Date;
  /** Cuándo se cerró el día anterior: un evento con hora previa es de un día ya cerrado. */
  ultimoCierre: Date | null;
}

/**
 * El día en curso. El cierre se hace por turno (el arqueo de la caja), no por
 * día: esto queda como el agrupador técnico de los eventos en el servidor.
 * Si no hay uno abierto (el primero), se abre.
 */
export async function diaAbierto(): Promise<DiaAbierto> {
  const [abierto] = await db.select().from(diasOperativos).where(isNull(diasOperativos.cerradoEn)).limit(1);
  const [anterior] = await db
    .select({ cerradoEn: diasOperativos.cerradoEn })
    .from(diasOperativos)
    .where(isNotNull(diasOperativos.cerradoEn))
    .orderBy(desc(diasOperativos.cerradoEn))
    .limit(1);
  if (abierto) return { id: abierto.id, abiertoEn: abierto.abiertoEn, ultimoCierre: anterior?.cerradoEn ?? null };
  // Dos pedidos que llegan juntos pueden querer abrirlo a la vez: el índice
  // único deja pasar uno y el otro lo lee.
  const [nuevo] = await db.insert(diasOperativos).values({}).onConflictDoNothing().returning();
  if (nuevo) return { id: nuevo.id, abiertoEn: nuevo.abiertoEn, ultimoCierre: anterior?.cerradoEn ?? null };
  return diaAbierto();
}

export async function eventosAceptados(dondeTipos?: string[]): Promise<EventoNuevo[]> {
  const filas = await db
    .select()
    .from(eventos)
    .where(and(eq(eventos.resultado, 'aceptado'), dondeTipos ? inArray(eventos.agregadoTipo, dondeTipos) : undefined))
    .orderBy(asc(eventos.secuencia));
  return filas.map(
    (f) =>
      ({
        id: f.id,
        tipo: f.tipo,
        version: f.version,
        dispositivoId: f.dispositivoId,
        operadorId: f.operadorId,
        autorizadoPorId: f.autorizadoPorId,
        motivoId: f.motivoId,
        motivoTexto: f.motivoTexto,
        creadoEnDispositivo: f.creadoEnDispositivo.toISOString(),
        agregadoId: f.agregadoId,
        datos: f.datos,
      }) as EventoNuevo,
  );
}

/** Qué turnos existen y cuáles están cerrados, según el log. */
export async function estadoTurnos(): Promise<Map<string, { cerrado: boolean }>> {
  const estado = reducirCaja(await eventosAceptados(['turno']));
  return new Map([...estado.turnos.values()].map((t) => [t.id, { cerrado: t.cerradoEn !== null }]));
}

