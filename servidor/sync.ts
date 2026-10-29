import 'server-only';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { dispositivos, elementosPlano, eventos, mediosPago, modificadores, motivosAutorizacion, preciosProducto, productos, reglasAutorizacion, usuarios } from '@/db/esquema';
import { ACCIONES_AUTORIZABLES, autorizacionRequerida, esAccionAutorizable, puedeAutorizar, type AccionAutorizable, type ReglasAutorizacion } from '@/dominio/autorizaciones';
import { reducirSalon, type Cuenta } from '@/dominio/reductores/salon';
import { definicion, type EventoConfirmado, type EventoNuevo } from '@/dominio/eventos';
import { puede } from '@/dominio/permisos';
import { esRol, type Rol } from '@/dominio/roles';
import { ErrorAcceso, ErrorDominio, type UsuarioSesion } from '@/lib/sesion';
import type { Catalogo } from '@/dominio/catalogo';
import { auditar } from './auditoria';
import { leerCatalogo } from './catalogo';
import { diaAbierto, estadoTurnos } from './dia';
import { registrarConsumoTeorico } from './stock';

export type Recepcion =
  | { id: string; resultado: 'aceptado'; secuencia: number }
  | { id: string; resultado: 'rechazado'; secuencia: number; motivo: string };

async function dispositivoVigente(id: string) {
  const fila = await db.query.dispositivos.findFirst({ where: and(eq(dispositivos.id, id), isNull(dispositivos.revocadoEn)) });
  if (!fila) throw new ErrorAcceso(403, 'Este dispositivo no está registrado o fue dado de baja');
  return fila;
}

interface Referencias {
  usuarios: Map<string, { rol: Rol; activo: boolean }>;
  precios: Map<string, { productoId: string; precioCentavos: number }>;
  productos: Map<string, { estacionId: string }>;
  modificadores: Map<string, number>;
  mesas: Set<string>;
  medios: Set<string>;
  motivos: Map<string, AccionAutorizable>;
  reglas: Partial<ReglasAutorizacion>;
}

/** Todo lo que el lote nombra, traído de una vez y no evento por evento. */
async function referenciasDe(lote: EventoNuevo[]): Promise<Referencias> {
  const idsUsuarios = new Set<string>();
  const idsPrecios = new Set<string>();
  const idsProductos = new Set<string>();
  const idsModificadores = new Set<string>();
  const idsMesas = new Set<string>();
  const idsMedios = new Set<string>();
  for (const e of lote) {
    if (e.tipo === 'cobro_registrado') for (const p of e.datos.pagos) idsMedios.add(p.medioId);
    if (e.tipo === 'turno_cerrado') for (const p of e.datos.declarado) idsMedios.add(p.medioId);
    idsUsuarios.add(e.operadorId);
    if (e.autorizadoPorId) idsUsuarios.add(e.autorizadoPorId);
    if (e.tipo === 'cuenta_abierta') {
      idsUsuarios.add(e.datos.mozoId);
      if (e.datos.mesaId) idsMesas.add(e.datos.mesaId);
    }
    if (e.tipo === 'mozo_cambiado') idsUsuarios.add(e.datos.mozoId);
    if (e.tipo === 'cuenta_movida') idsMesas.add(e.datos.mesaDestinoId);
    if (e.tipo === 'item_agregado') {
      idsPrecios.add(e.datos.precioId);
      idsProductos.add(e.datos.productoId);
      for (const m of e.datos.modificadores) idsModificadores.add(m.modificadorId);
    }
  }
  const lista = <T,>(s: Set<T>) => [...s];
  const [filasUsuarios, filasPrecios, filasProductos, filasModificadores, filasMesas, filasMedios, filasMotivos, filasReglas] = await Promise.all([
    idsUsuarios.size ? db.select({ id: usuarios.id, rol: usuarios.rol, activo: usuarios.activo }).from(usuarios).where(inArray(usuarios.id, lista(idsUsuarios))) : [],
    idsPrecios.size ? db.select().from(preciosProducto).where(inArray(preciosProducto.id, lista(idsPrecios))) : [],
    idsProductos.size ? db.select({ id: productos.id, estacionId: productos.estacionId }).from(productos).where(inArray(productos.id, lista(idsProductos))) : [],
    idsModificadores.size ? db.select({ id: modificadores.id, precioCentavos: modificadores.precioCentavos }).from(modificadores).where(inArray(modificadores.id, lista(idsModificadores))) : [],
    idsMesas.size
      ? db.select({ id: elementosPlano.id }).from(elementosPlano).where(and(inArray(elementosPlano.id, lista(idsMesas)), eq(elementosPlano.tipo, 'mesa')))
      : [],
    idsMedios.size ? db.select({ id: mediosPago.id }).from(mediosPago).where(inArray(mediosPago.id, lista(idsMedios))) : [],
    db.select({ id: motivosAutorizacion.id, accion: motivosAutorizacion.accion }).from(motivosAutorizacion),
    db.select().from(reglasAutorizacion),
  ]);
  return {
    usuarios: new Map(filasUsuarios.filter((u) => esRol(u.rol)).map((u) => [u.id, { rol: u.rol as Rol, activo: u.activo }])),
    precios: new Map(filasPrecios.map((p) => [p.id, { productoId: p.productoId, precioCentavos: p.precioCentavos }])),
    productos: new Map(filasProductos.map((p) => [p.id, { estacionId: p.estacionId }])),
    modificadores: new Map(filasModificadores.map((m) => [m.id, m.precioCentavos])),
    mesas: new Set(filasMesas.map((m) => m.id)),
    medios: new Set(filasMedios.map((m) => m.id)),
    motivos: new Map(filasMotivos.filter((m) => esAccionAutorizable(m.accion)).map((m) => [m.id, m.accion as AccionAutorizable])),
    reglas: Object.fromEntries(filasReglas.filter((r) => esAccionAutorizable(r.accion)).map((r) => [r.accion, r.roles.filter(esRol)])),
  };
}

/**
 * Por qué se rechaza un evento, o `null` si pasa. Es la misma regla que el
 * dispositivo aplicó sin red: si llega acá sin cumplirla, se guarda igual
 * —rechazado, nunca descartado— para que quede el rastro.
 *
 * Un precio archivado se acepta (el dispositivo pudo no haberse enterado del
 * cambio), pero tiene que ser un precio real de ese producto y por ese
 * importe: si no, alguien está cobrando lo que quiere.
 */
function motivoDeRechazo(evento: EventoNuevo, ref: Referencias): string | null {
  const operador = ref.usuarios.get(evento.operadorId);
  if (!operador) return 'El operador no existe';
  if (!operador.activo) return 'El operador está desactivado';
  if (!puede(operador, definicion(evento.tipo).accion)) return 'El operador no tiene permiso para esta acción';
  if (definicion(evento.tipo).agregado === 'dispositivo' && evento.agregadoId !== evento.dispositivoId) {
    return 'El evento no corresponde a este dispositivo';
  }

  switch (evento.tipo) {
    case 'cuenta_abierta':
    case 'mozo_cambiado': {
      const mozo = ref.usuarios.get(evento.datos.mozoId);
      if (!mozo?.activo) return 'El mozo no existe o está desactivado';
      if (evento.tipo === 'cuenta_abierta' && evento.datos.mesaId && !ref.mesas.has(evento.datos.mesaId)) return 'La mesa no existe';
      return null;
    }
    case 'cuenta_movida':
      return ref.mesas.has(evento.datos.mesaDestinoId) ? null : 'La mesa no existe';
    case 'item_agregado': {
      const precio = ref.precios.get(evento.datos.precioId);
      if (!precio || precio.productoId !== evento.datos.productoId) return 'El precio no corresponde al producto';
      if (precio.precioCentavos !== evento.datos.precioCentavos) return 'El importe no coincide con el precio de la carta';
      if (!ref.productos.has(evento.datos.productoId)) return 'El producto no existe';
      for (const m of evento.datos.modificadores) {
        if (ref.modificadores.get(m.modificadorId) !== m.precioCentavos) return `El importe de «${m.nombre}» no coincide con la carta`;
      }
      return null;
    }
    case 'cobro_registrado':
    case 'turno_cerrado': {
      const pagos = evento.tipo === 'cobro_registrado' ? evento.datos.pagos : evento.datos.declarado;
      return pagos.every((p) => ref.medios.has(p.medioId)) ? null : 'El medio de pago no existe';
    }
    default:
      return null;
  }
}

/**
 * Si el evento necesitaba autorización, que la traiga: alguien activo, con
 * un rol que autoriza esa acción según las reglas, y un motivo de esa acción.
 * El PIN se verificó en el dispositivo; acá se verifica quién y por qué.
 */
function motivoDeAutorizacion(evento: EventoNuevo, cuenta: Cuenta | undefined, ref: Referencias): string | null {
  const accion = autorizacionRequerida(evento, cuenta);
  if (!accion) return null;
  const falta = `Falta autorización: ${ACCIONES_AUTORIZABLES[accion].toLowerCase()}`;
  if (!evento.autorizadoPorId || !evento.motivoId) return falta;
  const autorizador = ref.usuarios.get(evento.autorizadoPorId);
  if (!autorizador?.activo) return 'Quien autorizó no existe o está desactivado';
  if (!puedeAutorizar(autorizador.rol, accion, ref.reglas)) return 'Quien autorizó no puede autorizar esta acción';
  if (ref.motivos.get(evento.motivoId) !== accion) return 'El motivo no corresponde a la acción';
  return null;
}

/**
 * Los eventos ya aceptados de las cuentas que nombra el lote (y de las que se
 * les unieron), para saber, por ejemplo, si había una precuenta.
 */
async function historiaDeCuentas(lote: EventoNuevo[]): Promise<Map<string, EventoNuevo[]>> {
  const ids = new Set(lote.filter((e) => definicion(e.tipo).agregado === 'cuenta').map((e) => e.agregadoId));
  const historia = new Map<string, EventoNuevo[]>();
  if (!ids.size) return historia;
  const filas = await db
    .select()
    .from(eventos)
    .where(and(eq(eventos.agregadoTipo, 'cuenta'), eq(eventos.resultado, 'aceptado'), inArray(eventos.agregadoId, [...ids])))
    .orderBy(asc(eventos.secuencia));
  for (const f of filas) {
    const evento = { ...f, creadoEnDispositivo: f.creadoEnDispositivo.toISOString() } as unknown as EventoNuevo;
    historia.set(f.agregadoId, [...(historia.get(f.agregadoId) ?? []), evento]);
  }
  return historia;
}

function cuentaSegun(historia: Map<string, EventoNuevo[]>, cuentaId: string): Cuenta | undefined {
  const propios = historia.get(cuentaId) ?? [];
  const origenes = propios.flatMap((e) => (e.tipo === 'cuentas_unidas' ? (historia.get(e.datos.cuentaOrigenId) ?? []) : []));
  return reducirSalon([...origenes, ...propios]).cuentas.get(cuentaId);
}

/**
 * Las reglas de la caja que dependen de lo que ya pasó: un solo turno abierto
 * a la vez, y nada se imputa a un turno cerrado. Dos cajas que abren sin red
 * al mismo tiempo: la segunda queda rechazada y a la vista.
 */
function motivoDeTurno(evento: EventoNuevo, turnos: Map<string, { cerrado: boolean }>): string | null {
  if (evento.tipo === 'turno_abierto') {
    if (turnos.has(evento.agregadoId)) return null;
    return [...turnos.values()].some((t) => !t.cerrado) ? 'Ya hay una caja abierta' : null;
  }
  const turnoId = evento.tipo === 'cobro_registrado' ? evento.datos.turnoId : evento.tipo === 'salida_caja' || evento.tipo === 'turno_cerrado' ? evento.agregadoId : null;
  if (!turnoId) return null;
  const turno = turnos.get(turnoId);
  if (!turno) return 'La caja no existe';
  if (turno.cerrado) return 'La caja ya estaba cerrada';
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
  const [referencias, turnos, dia, historia] = await Promise.all([referenciasDe(lote), estadoTurnos(), diaAbierto(), historiaDeCuentas(lote)]);

  const recepciones: Recepcion[] = [];
  for (const evento of lote) {
    const esDeCuenta = definicion(evento.tipo).agregado === 'cuenta';
    const motivo =
      motivoDeRechazo(evento, referencias) ??
      motivoDeTurno(evento, turnos) ??
      motivoDeAutorizacion(evento, esDeCuenta ? cuentaSegun(historia, evento.agregadoId) : undefined, referencias);
    if (!motivo && esDeCuenta) historia.set(evento.agregadoId, [...(historia.get(evento.agregadoId) ?? []), evento]);
    if (!motivo && evento.tipo === 'turno_abierto') turnos.set(evento.agregadoId, { cerrado: false });
    if (!motivo && evento.tipo === 'turno_cerrado') turnos.set(evento.agregadoId, { cerrado: true });
    const creadoEn = new Date(evento.creadoEnDispositivo);
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
        creadoEnDispositivo: creadoEn,
        resultado: motivo ? 'rechazado' : 'aceptado',
        motivoRechazo: motivo,
        diaOperativoId: dia.id,
        posteriorAlCierre: dia.ultimoCierre !== null && creadoEn < dia.ultimoCierre,
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
    // Recién aceptado: lo que salió a cocina descuenta del stock según la receta.
    // Si falla, la venta no se pierde: queda en el log y el error en el registro del servidor.
    if (insertado?.resultado === 'aceptado' && evento.tipo === 'items_enviados') {
      await registrarConsumoTeorico(evento).catch((error: unknown) => console.error('[stock] consumo teórico', error));
    }
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

/** Lo que un dispositivo necesita para trabajar sin red. Sólo para dispositivos registrados: lleva los PIN. */
export async function catalogoDeDispositivo(dispositivoId: string): Promise<Catalogo> {
  await dispositivoVigente(dispositivoId);
  return leerCatalogo();
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
