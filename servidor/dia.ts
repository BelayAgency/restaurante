import 'server-only';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { diasOperativos, dispositivos, eventos, mediosPago } from '@/db/esquema';
import type { EventoNuevo } from '@/dominio/eventos';
import { puede } from '@/dominio/permisos';
import { arqueo, diferenciaTotal, reducirCaja } from '@/dominio/reductores/caja';
import { cuentasAbiertas, reducirSalon } from '@/dominio/reductores/salon';
import { ErrorAcceso, ErrorDominio, type UsuarioSesion } from '@/lib/sesion';

export interface DiaAbierto {
  id: string;
  abiertoEn: Date;
  /** Cuándo se cerró el día anterior: un evento con hora previa es de un día ya cerrado. */
  ultimoCierre: Date | null;
}

/** El día en curso. Si no hay uno abierto (recién cerrado, o el primero), se abre. */
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

async function eventosAceptados(dondeTipos?: string[]): Promise<EventoNuevo[]> {
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

export async function resumenDelDia(actor: UsuarioSesion) {
  if (!puede(actor, 'dia.cerrar')) throw new ErrorAcceso(403, 'No tenés permiso para cerrar el día');
  const dia = await diaAbierto();
  const [todos, medios, filasDispositivos] = await Promise.all([
    eventosAceptados(),
    db.select({ id: mediosPago.id, nombre: mediosPago.nombre, efectivo: mediosPago.efectivo }).from(mediosPago).where(isNull(mediosPago.archivadoEn)),
    db.select().from(dispositivos).where(isNull(dispositivos.revocadoEn)).orderBy(asc(dispositivos.nombre)),
  ]);
  const idsDelDia = new Set(
    (await db.select({ id: eventos.id }).from(eventos).where(and(eq(eventos.diaOperativoId, dia.id), eq(eventos.resultado, 'aceptado')))).map((f) => f.id),
  );
  const delDia = todos.filter((e) => idsDelDia.has(e.id));

  const salon = reducirSalon(todos);
  const caja = reducirCaja(todos);
  const turnosDelDia = [...caja.turnos.values()].filter((t) => delDia.some((e) => e.tipo === 'turno_abierto' && e.agregadoId === t.id));
  const cobros = delDia.filter((e) => e.tipo === 'cobro_registrado');
  const ventasCentavos = cobros.reduce((s, e) => s + (e.tipo === 'cobro_registrado' ? e.datos.consumoCentavos : 0), 0);
  const propinasCentavos = cobros.reduce((s, e) => s + (e.tipo === 'cobro_registrado' ? e.datos.propinaCentavos : 0), 0);
  const comensales = delDia.reduce((s, e) => s + (e.tipo === 'cuenta_abierta' ? e.datos.comensales : 0), 0);

  return {
    dia,
    cuentasAbiertas: cuentasAbiertas(salon).length,
    turnosAbiertos: turnosDelDia.filter((t) => !t.cerradoEn).length,
    ventasCentavos,
    propinasCentavos,
    comensales,
    cobros: cobros.length,
    turnos: turnosDelDia.map((t) => {
      const filas = arqueo(t, medios);
      return {
        id: t.id,
        abiertoPor: t.abiertoPor,
        cerradoPor: t.cerradoPor,
        abiertoEn: t.abiertoEn,
        cerradoEn: t.cerradoEn,
        filas,
        diferenciaCentavos: t.cerradoEn ? diferenciaTotal(filas) : null,
      };
    }),
    dispositivos: filasDispositivos.map((d) => ({ id: d.id, nombre: d.nombre, ultimoContacto: d.ultimoContacto?.toISOString() ?? null })),
  };
}

export type ResumenDia = Awaited<ReturnType<typeof resumenDelDia>>;

/**
 * Congela el día. Exige caja y cuentas cerradas: un día con una mesa abierta
 * no tiene totales. Lo que llegue después con hora de este día entra en el
 * siguiente, marcado como posterior al cierre.
 */
export async function cerrarDia(actor: UsuarioSesion) {
  const resumen = await resumenDelDia(actor);
  if (resumen.cuentasAbiertas > 0) throw new ErrorDominio(`Hay ${resumen.cuentasAbiertas} cuentas abiertas: cobralas o cerralas antes de cerrar el día`);
  if (resumen.turnosAbiertos > 0) throw new ErrorDominio('La caja sigue abierta: hacé el arqueo antes de cerrar el día');

  const totales = {
    ventasCentavos: resumen.ventasCentavos,
    propinasCentavos: resumen.propinasCentavos,
    comensales: resumen.comensales,
    cobros: resumen.cobros,
    turnos: resumen.turnos.map((t) => ({ id: t.id, diferenciaCentavos: t.diferenciaCentavos })),
  };
  await db.transaction(async (tx) => {
    await tx.update(diasOperativos).set({ cerradoEn: new Date(), cerradoPorId: actor.id, totales }).where(eq(diasOperativos.id, resumen.dia.id));
    await tx.insert(diasOperativos).values({});
  });
  return totales;
}
