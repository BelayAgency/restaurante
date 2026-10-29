import 'server-only';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { dispositivos, eventos, pinesOperador, usuarios } from '@/db/esquema';
import { definicion, type EventoConfirmado, type EventoNuevo } from '@/dominio/eventos';
import { puede } from '@/dominio/permisos';
import { esRol, type Rol } from '@/dominio/roles';
import { ErrorAcceso, ErrorDominio, type UsuarioSesion } from '@/lib/sesion';
import { auditar } from './auditoria';

export type Recepcion =
  | { id: string; resultado: 'aceptado'; secuencia: number }
  | { id: string; resultado: 'rechazado'; secuencia: number; motivo: string };

async function dispositivoVigente(id: string) {
  const fila = await db.query.dispositivos.findFirst({ where: and(eq(dispositivos.id, id), isNull(dispositivos.revocadoEn)) });
  if (!fila) throw new ErrorAcceso(403, 'Este dispositivo no está registrado o fue dado de baja');
  return fila;
}

/**
 * Por qué se rechaza un evento, o `null` si pasa. Es la misma regla que el
 * dispositivo aplicó sin red: si llega acá sin cumplirla, se guarda igual
 * —rechazado, nunca descartado— para que quede el rastro.
 */
function motivoDeRechazo(evento: EventoNuevo, operadores: Map<string, { rol: Rol; activo: boolean }>): string | null {
  const operador = operadores.get(evento.operadorId);
  if (!operador) return 'El operador no existe';
  if (!operador.activo) return 'El operador está desactivado';
  if (!puede(operador, definicion(evento.tipo).accion)) return 'El operador no tiene permiso para esta acción';
  if (evento.agregadoId !== evento.dispositivoId && definicion(evento.tipo).agregado === 'dispositivo') {
    return 'El evento no corresponde a este dispositivo';
  }
  return null;
}

/**
 * Recibe la bandeja de un dispositivo. Idempotente por id: un evento que ya
 * estaba devuelve lo que se resolvió la primera vez, así el dispositivo puede
 * reenviar sin miedo después de un corte a mitad de la respuesta.
 */
export async function recibirEventos(actor: UsuarioSesion, dispositivoId: string, lote: EventoNuevo[], horaDispositivo: string | null) {
  await dispositivoVigente(dispositivoId);
  if (lote.some((e) => e.dispositivoId !== dispositivoId)) throw new ErrorDominio('El lote mezcla eventos de otro dispositivo');

  const idsOperadores = [...new Set(lote.map((e) => e.operadorId))];
  const filasOperadores = idsOperadores.length
    ? await db.select({ id: usuarios.id, rol: usuarios.rol, activo: usuarios.activo }).from(usuarios).where(inArray(usuarios.id, idsOperadores))
    : [];
  const operadores = new Map(filasOperadores.filter((o) => esRol(o.rol)).map((o) => [o.id, { rol: o.rol as Rol, activo: o.activo }]));

  const recepciones: Recepcion[] = [];
  for (const evento of lote) {
    const motivo = motivoDeRechazo(evento, operadores);
    const [insertado] = await db
      .insert(eventos)
      .values({
        id: evento.id,
        tipo: evento.tipo,
        version: evento.version,
        agregadoTipo: definicion(evento.tipo).agregado,
        agregadoId: evento.agregadoId,
        datos: evento.datos,
        operadorId: evento.operadorId,
        autorizadoPorId: evento.autorizadoPorId,
        motivoId: evento.motivoId,
        motivoTexto: evento.motivoTexto,
        dispositivoId,
        sesionUsuarioId: actor.id,
        creadoEnDispositivo: new Date(evento.creadoEnDispositivo),
        resultado: motivo ? 'rechazado' : 'aceptado',
        motivoRechazo: motivo,
      })
      .onConflictDoNothing({ target: eventos.id })
      .returning({ secuencia: eventos.secuencia, resultado: eventos.resultado, motivoRechazo: eventos.motivoRechazo });

    const fila =
      insertado ??
      (await db.query.eventos.findFirst({
        where: eq(eventos.id, evento.id),
        columns: { secuencia: true, resultado: true, motivoRechazo: true },
      }));
    if (!fila) continue;
    recepciones.push(
      fila.resultado === 'aceptado'
        ? { id: evento.id, resultado: 'aceptado', secuencia: fila.secuencia }
        : { id: evento.id, resultado: 'rechazado', secuencia: fila.secuencia, motivo: fila.motivoRechazo ?? 'Rechazado' },
    );
  }

  // Un reloj atrasado es una forma de meter una venta en un turno ya cerrado:
  // se mide en cada contacto.
  const desfase = horaDispositivo ? Date.now() - new Date(horaDispositivo).getTime() : null;
  await db
    .update(dispositivos)
    .set({ ultimoContacto: new Date(), desfaseRelojMs: desfase !== null && Number.isFinite(desfase) ? Math.round(desfase) : null })
    .where(eq(dispositivos.id, dispositivoId));

  return recepciones;
}

export const LIMITE_PULL = 500;

export async function eventosDesde(dispositivoId: string, desde: number): Promise<{ eventos: EventoConfirmado[]; hayMas: boolean }> {
  await dispositivoVigente(dispositivoId);
  const filas = await db
    .select()
    .from(eventos)
    .where(and(gt(eventos.secuencia, desde), eq(eventos.resultado, 'aceptado')))
    .orderBy(asc(eventos.secuencia))
    .limit(LIMITE_PULL + 1);

  return {
    hayMas: filas.length > LIMITE_PULL,
    eventos: filas.slice(0, LIMITE_PULL).map(
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
          secuencia: f.secuencia,
          recibidoEn: f.recibidoEn.toISOString(),
        }) as EventoConfirmado,
    ),
  };
}

export interface OperadorCatalogo {
  id: string;
  nombre: string;
  rol: Rol;
  pinHash: string | null;
}

/**
 * Lo que un dispositivo necesita para trabajar sin red. Hoy, quiénes pueden
 * operar y su PIN; en las fases siguientes, carta, plano, motivos y reglas.
 */
export async function catalogo(dispositivoId: string): Promise<{ operadores: OperadorCatalogo[] }> {
  await dispositivoVigente(dispositivoId);
  const filas = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre, rol: usuarios.rol, esSoporte: usuarios.esSoporte, pinHash: pinesOperador.hash })
    .from(usuarios)
    .leftJoin(pinesOperador, eq(pinesOperador.usuarioId, usuarios.id))
    .where(eq(usuarios.activo, true))
    .orderBy(asc(usuarios.nombre));
  // Soporte no opera el salón: no aparece en el selector de operador.
  return {
    operadores: filas
      .filter((f) => !f.esSoporte && esRol(f.rol))
      .map((f) => ({ id: f.id, nombre: f.nombre, rol: f.rol as Rol, pinHash: f.pinHash })),
  };
}

export async function registrarDispositivo(actor: UsuarioSesion, id: string, nombre: string, ip: string | null) {
  if (!puede(actor, 'dispositivos.registrar')) throw new ErrorAcceso(403, 'No tenés permiso para registrar dispositivos');
  const existente = await db.query.dispositivos.findFirst({ where: eq(dispositivos.id, id) });
  if (existente) {
    if (existente.revocadoEn) throw new ErrorDominio('Este dispositivo fue dado de baja');
    return;
  }
  await db.insert(dispositivos).values({ id, nombre, registradoPorId: actor.id });
  await auditar({ accion: 'dispositivo.registrado', actor, objetivoTipo: 'dispositivo', objetivoId: id, detalle: { nombre }, ip });
}

export async function listarDispositivos(actor: UsuarioSesion) {
  if (!puede(actor, 'dispositivos.administrar')) throw new ErrorAcceso(403, 'No tenés permiso');
  return db.select().from(dispositivos).orderBy(asc(dispositivos.nombre));
}

export async function revocarDispositivo(actor: UsuarioSesion, id: string, ip: string | null) {
  if (!puede(actor, 'dispositivos.administrar')) throw new ErrorAcceso(403, 'No tenés permiso');
  await db.update(dispositivos).set({ revocadoEn: new Date() }).where(and(eq(dispositivos.id, id), isNull(dispositivos.revocadoEn)));
  await auditar({ accion: 'dispositivo.revocado', actor, objetivoTipo: 'dispositivo', objetivoId: id, ip });
}
