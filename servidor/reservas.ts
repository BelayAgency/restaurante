import 'server-only';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { reservas, usuarios } from '@/db/esquema';
import { puede } from '@/dominio/permisos';
import { correrDia, momentoReserva, type DatosReserva, type EstadoReserva } from '@/dominio/reservas';
import { ErrorAcceso, ErrorDominio, type UsuarioSesion } from '@/lib/sesion';
import { auditar } from './auditoria';

function exigir(actor: UsuarioSesion) {
  if (!puede(actor, 'reservas.operar')) throw new ErrorAcceso(403, 'No tenés permiso para manejar reservas');
}

export async function leerReservasDelDia(actor: UsuarioSesion, dia: string) {
  exigir(actor);
  const filas = await db
    .select({
      id: reservas.id,
      nombreCliente: reservas.nombreCliente,
      telefono: reservas.telefono,
      personas: reservas.personas,
      reservadaPara: reservas.reservadaPara,
      nota: reservas.nota,
      estado: reservas.estadoReserva,
      cuentaId: reservas.cuentaId,
      creadaPor: usuarios.nombre,
    })
    .from(reservas)
    .leftJoin(usuarios, eq(usuarios.id, reservas.creadaPorId))
    .where(and(gte(reservas.reservadaPara, momentoReserva(dia, '00:00')), lt(reservas.reservadaPara, momentoReserva(correrDia(dia, 1), '00:00'))))
    .orderBy(asc(reservas.reservadaPara));
  return filas.map((f) => ({ ...f, reservadaPara: f.reservadaPara.toISOString() }));
}

export type ReservaDelDia = Awaited<ReturnType<typeof leerReservasDelDia>>[number];

async function pendiente(id: string) {
  const [fila] = await db.select({ estado: reservas.estadoReserva }).from(reservas).where(eq(reservas.id, id));
  if (!fila) throw new ErrorDominio('La reserva no existe');
  if (fila.estado !== 'pendiente') throw new ErrorDominio('La reserva ya se resolvió: no se puede cambiar');
}

export async function guardarReserva(actor: UsuarioSesion, datos: DatosReserva, ip: string | null) {
  exigir(actor);
  const valores = {
    nombreCliente: datos.nombreCliente,
    telefono: datos.telefono,
    personas: datos.personas,
    reservadaPara: momentoReserva(datos.fecha, datos.hora),
    nota: datos.nota,
  };
  let id = datos.id;
  if (id) {
    await pendiente(id);
    await db.update(reservas).set(valores).where(eq(reservas.id, id));
  } else {
    [{ id }] = await db
      .insert(reservas)
      .values({ ...valores, creadaPorId: actor.id })
      .returning({ id: reservas.id });
  }
  await auditar({ accion: 'reserva.modificada', actor, objetivoTipo: 'reserva', objetivoId: id!, detalle: { que: datos.id ? 'editada' : 'creada', ...valores }, ip });
  return id!;
}

/** No vino o se canceló. Queda como estaba: una reserva no se borra. */
export async function cerrarReserva(actor: UsuarioSesion, id: string, estado: Extract<EstadoReserva, 'no_vino' | 'cancelada'>, ip: string | null) {
  exigir(actor);
  await pendiente(id);
  await db.update(reservas).set({ estadoReserva: estado, resueltaPorId: actor.id, resueltaEn: new Date() }).where(eq(reservas.id, id));
  await auditar({ accion: 'reserva.modificada', actor, objetivoTipo: 'reserva', objetivoId: id, detalle: { que: estado }, ip });
}

/**
 * Llegaron: la cuenta ya la abrió el dispositivo con su evento, que es lo que
 * cuenta para el salón; acá queda atada a la reserva.
 */
export async function sentarReserva(actor: UsuarioSesion, id: string, cuentaId: string, ip: string | null) {
  exigir(actor);
  await pendiente(id);
  await db.update(reservas).set({ estadoReserva: 'sentada', cuentaId, resueltaPorId: actor.id, resueltaEn: new Date() }).where(eq(reservas.id, id));
  await auditar({ accion: 'reserva.modificada', actor, objetivoTipo: 'reserva', objetivoId: id, detalle: { que: 'sentada', cuentaId }, ip });
}

/** Lo que espera hoy, para el salón: las pendientes del día. */
export async function leerPendientesDeHoy(actor: UsuarioSesion, dia: string) {
  if (!puede(actor, 'reservas.operar')) return [];
  return (await leerReservasDelDia(actor, dia)).filter((r) => r.estado === 'pendiente');
}
