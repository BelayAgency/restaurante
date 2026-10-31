import 'server-only';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '@/db/cliente';
import {
  alertasVistas,
  configuracionControl,
  conteos,
  eventos,
  lineasConteo,
  insumos,
  mediosPago,
  motivosAutorizacion,
  movimientosStock,
  reglasAutorizacion,
  usuarios,
} from '@/db/esquema';
import { esAccionAutorizable, REGLAS_POR_DEFECTO, type AccionAutorizable, type ReglasAutorizacion } from '@/dominio/autorizaciones';
import type { DatosDe, EventoNuevo } from '@/dominio/eventos';
import { puede } from '@/dominio/permisos';
import { arqueo, diferenciaTotal, reducirCaja } from '@/dominio/reductores/caja';
import { importeItem, reducirSalon, saldoCuenta, totalCuenta } from '@/dominio/reductores/salon';
import { esRol, type Rol } from '@/dominio/roles';
import { ErrorAcceso, type UsuarioSesion } from '@/lib/sesion';
import { auditar } from './auditoria';
import { diferenciasDeStock } from './stock';

export interface Umbrales {
  minutosMesaAbierta: number;
  porcentajeDescuento: number;
  diferenciaCajaCentavos: number;
  diferenciaConteoCentavos: number;
  /** Horario del local, en horas de Buenos Aires. Si cierra pasada la medianoche, `horaCierre` es menor. */
  horaApertura: number;
  horaCierre: number;
}

const UMBRALES_POR_DEFECTO: Umbrales = {
  minutosMesaAbierta: 180,
  porcentajeDescuento: 15,
  diferenciaCajaCentavos: 100_000,
  diferenciaConteoCentavos: 500_000,
  horaApertura: 11,
  horaCierre: 2,
};

export async function leerUmbrales(): Promise<Umbrales> {
  const [fila] = await db.select().from(configuracionControl).where(eq(configuracionControl.id, 1));
  return { ...UMBRALES_POR_DEFECTO, ...(fila?.umbrales ?? {}) };
}

const HORA = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false });

function fueraDeHorario(iso: string, u: Umbrales): boolean {
  const hora = Number(HORA.format(new Date(iso))) % 24;
  const dentro = u.horaApertura <= u.horaCierre ? hora >= u.horaApertura && hora < u.horaCierre : hora >= u.horaApertura || hora < u.horaCierre;
  return !dentro;
}

function rango(desde: string, hasta: string) {
  return { inicio: new Date(`${desde}T00:00:00-03:00`), fin: new Date(`${hasta}T23:59:59.999-03:00`) };
}

function aEvento(f: typeof eventos.$inferSelect): EventoNuevo {
  return { ...f, creadoEnDispositivo: f.creadoEnDispositivo.toISOString() } as unknown as EventoNuevo;
}

/**
 * Los eventos del período y, completos, los de las cuentas que tocaron: para
 * saber si una anulación fue después de la precuenta hay que ver la cuenta
 * entera, aunque se haya abierto el día anterior.
 */
export async function eventosDelPeriodo(desde: string, hasta: string) {
  const { inicio, fin } = rango(desde, hasta);
  const delPeriodo = await db
    .select()
    .from(eventos)
    .where(and(eq(eventos.resultado, 'aceptado'), gte(eventos.creadoEnDispositivo, inicio), lte(eventos.creadoEnDispositivo, fin)))
    .orderBy(asc(eventos.secuencia));
  const cuentas = [...new Set(delPeriodo.filter((e) => e.agregadoTipo === 'cuenta').map((e) => e.agregadoId))];
  const deCuentas = cuentas.length
    ? await db
        .select()
        .from(eventos)
        .where(and(eq(eventos.resultado, 'aceptado'), eq(eventos.agregadoTipo, 'cuenta'), inArray(eventos.agregadoId, cuentas)))
        .orderBy(asc(eventos.secuencia))
    : [];
  const turnos = [...new Set(delPeriodo.filter((e) => e.agregadoTipo === 'turno').map((e) => e.agregadoId))];
  const deTurnos = turnos.length
    ? await db
        .select()
        .from(eventos)
        .where(and(eq(eventos.resultado, 'aceptado'), eq(eventos.agregadoTipo, 'turno'), inArray(eventos.agregadoId, turnos)))
        .orderBy(asc(eventos.secuencia))
    : [];
  const vistos = new Set<string>();
  const todos = [...deTurnos, ...deCuentas, ...delPeriodo]
    .filter((e) => (vistos.has(e.id) ? false : (vistos.add(e.id), true)))
    .sort((a, b) => a.secuencia - b.secuencia);
  return { todos: todos.map(aEvento), idsDelPeriodo: new Set(delPeriodo.map((e) => e.id)), inicio, fin };
}

export type TipoHecho = 'anulacion' | 'descuento' | 'cortesia' | 'precio' | 'sin_cobrar';

export interface Hecho {
  id: string;
  tipo: TipoHecho;
  momento: string;
  montoCentavos: number;
  operadorId: string;
  autorizadoPorId: string | null;
  mozoId: string | null;
  cuentaId: string;
  detalle: string;
  motivoId: string | null;
  motivoTexto: string | null;
  trasPrecuenta: boolean;
  fueraDeHorario: boolean;
  porcentaje: number | null;
}

/**
 * Las correcciones que costaron plata, con quién, quién autorizó y cuánto. Se
 * reconstruyen en orden para valuar cada una con lo que la cuenta tenía en ese
 * momento.
 */
function hechosDeControl(todos: EventoNuevo[], idsDelPeriodo: Set<string>, umbrales: Umbrales): Hecho[] {
  const hechos: Hecho[] = [];
  const vistos: EventoNuevo[] = [];
  for (const evento of todos) {
    const antes = evento.tipo === 'cuenta_cerrada' || evento.tipo.startsWith('item_') || evento.tipo === 'precio_modificado' || evento.tipo === 'descuento_aplicado'
      ? reducirSalon(vistos.filter((e) => e.agregadoId === evento.agregadoId || e.tipo === 'cuentas_unidas')).cuentas.get(evento.agregadoId)
      : undefined;
    vistos.push(evento);
    if (!idsDelPeriodo.has(evento.id) || !antes) continue;

    const base = {
      id: evento.id,
      momento: evento.creadoEnDispositivo,
      operadorId: evento.operadorId,
      autorizadoPorId: evento.autorizadoPorId,
      mozoId: antes.mozoId,
      cuentaId: antes.id,
      motivoId: evento.motivoId,
      motivoTexto: evento.motivoTexto,
      trasPrecuenta: antes.precuentas.length > 0,
      fueraDeHorario: fueraDeHorario(evento.creadoEnDispositivo, umbrales),
      porcentaje: null as number | null,
    };
    const item = 'datos' in evento && evento.datos && 'itemId' in evento.datos ? antes.items.get((evento.datos as { itemId: string }).itemId) : undefined;

    if (evento.tipo === 'item_anulado' && item) {
      // Bajarle la cantidad anula sólo esas unidades: el monto es el de ellas.
      const cantidad = Math.min((evento.datos as DatosDe<'item_anulado'>).cantidad ?? item.cantidad, item.cantidad);
      hechos.push({ ...base, tipo: 'anulacion', montoCentavos: importeItem({ ...item, cantidad }), detalle: `${cantidad} × ${item.nombre}` });
    }
    if (evento.tipo === 'item_cortesia' && item) {
      const cantidad = Math.min((evento.datos as DatosDe<'item_cortesia'>).cantidad ?? item.cantidad, item.cantidad);
      hechos.push({ ...base, tipo: 'cortesia', montoCentavos: importeItem({ ...item, cantidad }), detalle: `${cantidad} × ${item.nombre}` });
    }
    if (evento.tipo === 'precio_modificado' && item) {
      const nuevo = (evento.datos as DatosDe<'precio_modificado'>).precioCentavos;
      hechos.push({ ...base, tipo: 'precio', montoCentavos: (item.precioCentavos - nuevo) * item.cantidad, detalle: `${item.nombre}: de ${item.precioCentavos} a ${nuevo}` });
    }
    if (evento.tipo === 'descuento_aplicado') {
      const d = evento.datos;
      const total = totalCuenta(antes);
      hechos.push({
        ...base,
        tipo: 'descuento',
        montoCentavos: d.montoCentavos,
        detalle: d.porcentaje !== null ? `${d.porcentaje} %` : 'Monto fijo',
        porcentaje: d.porcentaje ?? (total > 0 ? (d.montoCentavos / total) * 100 : null),
      });
    }
    if (evento.tipo === 'cuenta_cerrada' && saldoCuenta(antes) > 0) {
      hechos.push({ ...base, tipo: 'sin_cobrar', montoCentavos: saldoCuenta(antes), detalle: 'Cerrada con saldo' });
    }
  }
  return hechos;
}

async function nombres(): Promise<Record<string, string>> {
  const filas = await db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios);
  return Object.fromEntries(filas.map((f) => [f.id, f.nombre]));
}

function sumarPor<T>(lista: T[], clave: (t: T) => string | null, monto: (t: T) => number) {
  const mapa = new Map<string, { cantidad: number; montoCentavos: number }>();
  for (const t of lista) {
    const k = clave(t);
    if (!k) continue;
    const actual = mapa.get(k) ?? { cantidad: 0, montoCentavos: 0 };
    actual.cantidad += 1;
    actual.montoCentavos += monto(t);
    mapa.set(k, actual);
  }
  return [...mapa.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.montoCentavos - a.montoCentavos);
}

/** El tablero de "dónde se va la plata" de un período. */
export async function tableroDeControl(actor: UsuarioSesion, desde: string, hasta: string) {
  if (!puede(actor, 'control.ver')) throw new ErrorAcceso(403, 'No tenés permiso');
  const umbrales = await leerUmbrales();
  const { todos, idsDelPeriodo, inicio, fin } = await eventosDelPeriodo(desde, hasta);
  const hechos = hechosDeControl(todos, idsDelPeriodo, umbrales);

  const medios = await db.select({ id: mediosPago.id, nombre: mediosPago.nombre, efectivo: mediosPago.efectivo }).from(mediosPago);
  const turnos = [...reducirCaja(todos).turnos.values()].filter((t) => t.cerradoEn && new Date(t.cerradoEn) >= inicio && new Date(t.cerradoEn) <= fin);
  const difCaja = turnos.map((t) => ({ turnoId: t.id, cajeroId: t.cerradoPor, cerradoEn: t.cerradoEn!, diferenciaCentavos: diferenciaTotal(arqueo(t, medios)) }));

  const stock = await diferenciasDeStock(actor, desde, hasta);
  const bajas = await db
    .select({ tipo: movimientosStock.tipo, cantidad: movimientosStock.cantidad, costo: movimientosStock.costoUnitario })
    .from(movimientosStock)
    .where(and(gte(movimientosStock.ocurridoEn, inicio), lte(movimientosStock.ocurridoEn, fin), inArray(movimientosStock.tipo, ['merma', 'vencimiento', 'comida_personal'])));
  const valorBaja = (tipos: string[]) => bajas.filter((b) => tipos.includes(b.tipo)).reduce((s, b) => s - b.cantidad * b.costo, 0);

  const salon = reducirSalon(todos);
  const cerradas = [...salon.cuentas.values()].filter((c) => c.estado === 'cerrada' && c.cerradaEn && new Date(c.cerradaEn) >= inicio && new Date(c.cerradaEn) <= fin);
  const porMozo = new Map<string, { comensales: number; consumoCentavos: number; cuentas: number }>();
  for (const c of cerradas) {
    const actual = porMozo.get(c.mozoId) ?? { comensales: 0, consumoCentavos: 0, cuentas: 0 };
    actual.comensales += c.comensales;
    actual.consumoCentavos += c.pagadoCentavos;
    actual.cuentas += 1;
    porMozo.set(c.mozoId, actual);
  }

  const de = (tipo: TipoHecho) => hechos.filter((h) => h.tipo === tipo);
  const total = (lista: { montoCentavos: number }[]) => lista.reduce((s, h) => s + h.montoCentavos, 0);
  const faltanteStock = stock.reduce((s, f) => s + Math.max(0, f.valorFaltante), 0);
  const faltanteCaja = difCaja.reduce((s, d) => s + Math.max(0, -d.diferenciaCentavos), 0);

  const filasMotivos = await db.select({ id: motivosAutorizacion.id, texto: motivosAutorizacion.texto }).from(motivosAutorizacion);

  return {
    nombres: await nombres(),
    motivos: Object.fromEntries(filasMotivos.map((m) => [m.id, m.texto])) as Record<string, string>,
    rubros: [
      { clave: 'stock', titulo: 'Faltante de stock sin explicar', montoCentavos: Math.round(faltanteStock), cantidad: stock.filter((f) => f.valorFaltante > 0).length },
      { clave: 'caja', titulo: 'Faltantes de caja', montoCentavos: faltanteCaja, cantidad: difCaja.filter((d) => d.diferenciaCentavos < 0).length },
      { clave: 'anulacion', titulo: 'Anulaciones', montoCentavos: total(de('anulacion')), cantidad: de('anulacion').length },
      { clave: 'descuento', titulo: 'Descuentos', montoCentavos: total(de('descuento')), cantidad: de('descuento').length },
      { clave: 'cortesia', titulo: 'Cortesías', montoCentavos: total(de('cortesia')), cantidad: de('cortesia').length },
      { clave: 'precio', titulo: 'Precios cambiados', montoCentavos: total(de('precio')), cantidad: de('precio').length },
      { clave: 'sin_cobrar', titulo: 'Cerradas sin cobrar', montoCentavos: total(de('sin_cobrar')), cantidad: de('sin_cobrar').length },
      { clave: 'merma', titulo: 'Mermas y vencimientos', montoCentavos: Math.round(valorBaja(['merma', 'vencimiento'])), cantidad: bajas.filter((b) => b.tipo !== 'comida_personal').length },
      { clave: 'personal', titulo: 'Comida del personal', montoCentavos: Math.round(valorBaja(['comida_personal'])), cantidad: bajas.filter((b) => b.tipo === 'comida_personal').length },
    ],
    hechos: hechos.sort((a, b) => b.momento.localeCompare(a.momento)),
    rankings: {
      porOperador: sumarPor(hechos, (h) => h.operadorId, (h) => h.montoCentavos),
      porAutorizante: sumarPor(hechos, (h) => h.autorizadoPorId, (h) => h.montoCentavos),
      porMozo: sumarPor(hechos, (h) => h.mozoId, (h) => h.montoCentavos),
      cajaPorCajero: sumarPor(difCaja, (d) => d.cajeroId, (d) => d.diferenciaCentavos),
      consumoPorComensal: [...porMozo.entries()]
        .map(([id, v]) => ({ id, ...v, porComensalCentavos: v.comensales ? Math.round(v.consumoCentavos / v.comensales) : 0 }))
        .sort((a, b) => a.porComensalCentavos - b.porComensalCentavos),
    },
    stock: stock.slice(0, 10),
  };
}

export type TableroControl = Awaited<ReturnType<typeof tableroDeControl>>;

export interface Alerta {
  clave: string;
  tipo: string;
  momento: string;
  titulo: string;
  detalle: string;
  montoCentavos: number | null;
  vista: boolean;
}

/** Lo que el dueño tiene que mirar, calculado del log. Sólo se guarda que alguien la vio. */
export async function calcularAlertas(desde: string, hasta: string): Promise<Alerta[]> {
  const umbrales = await leerUmbrales();
  const { todos, idsDelPeriodo, inicio, fin } = await eventosDelPeriodo(desde, hasta);
  const hechos = hechosDeControl(todos, idsDelPeriodo, umbrales);
  const quien = await nombres();
  const alertas: Omit<Alerta, 'vista'>[] = [];

  for (const h of hechos) {
    const persona = quien[h.operadorId] ?? 'alguien';
    if (h.tipo === 'anulacion' && h.trasPrecuenta) alertas.push({ clave: `${h.id}:precuenta`, tipo: 'anulacion', momento: h.momento, titulo: 'Anulación después de la precuenta', detalle: `${h.detalle} · ${persona}`, montoCentavos: h.montoCentavos });
    if (h.tipo === 'anulacion' && h.fueraDeHorario) alertas.push({ clave: `${h.id}:horario`, tipo: 'anulacion', momento: h.momento, titulo: 'Anulación fuera de horario', detalle: `${h.detalle} · ${persona}`, montoCentavos: h.montoCentavos });
    if (h.tipo === 'sin_cobrar') alertas.push({ clave: h.id, tipo: 'sin_cobrar', momento: h.momento, titulo: 'Cuenta cerrada sin cobrar', detalle: persona, montoCentavos: h.montoCentavos });
    if (h.tipo === 'descuento' && (h.porcentaje ?? 0) > umbrales.porcentajeDescuento) {
      alertas.push({ clave: h.id, tipo: 'descuento', momento: h.momento, titulo: `Descuento de más del ${umbrales.porcentajeDescuento} %`, detalle: `${h.detalle} · ${persona}`, montoCentavos: h.montoCentavos });
    }
  }

  const medios = await db.select({ id: mediosPago.id, nombre: mediosPago.nombre, efectivo: mediosPago.efectivo }).from(mediosPago);
  for (const t of reducirCaja(todos).turnos.values()) {
    if (!t.cerradoEn || new Date(t.cerradoEn) < inicio || new Date(t.cerradoEn) > fin) continue;
    const diferencia = diferenciaTotal(arqueo(t, medios));
    if (Math.abs(diferencia) > umbrales.diferenciaCajaCentavos) {
      alertas.push({ clave: `turno:${t.id}`, tipo: 'caja', momento: t.cerradoEn, titulo: diferencia < 0 ? 'Faltante de caja' : 'Sobrante de caja', detalle: quien[t.cerradoPor ?? ''] ?? '', montoCentavos: diferencia });
    }
  }

  const conteosCerrados = await db
    .select({ id: conteos.id, cerradoEn: conteos.cerradoEn, contado: lineasConteo.contado, teorico: lineasConteo.teorico, costo: insumos.costoUnitario })
    .from(conteos)
    .innerJoin(lineasConteo, eq(lineasConteo.conteoId, conteos.id))
    .innerJoin(insumos, eq(insumos.id, lineasConteo.insumoId))
    .where(and(isNotNull(conteos.cerradoEn), gte(conteos.cerradoEn, inicio), lte(conteos.cerradoEn, fin)));
  const porConteo = new Map<string, { cerradoEn: Date; diferencia: number }>();
  for (const f of conteosCerrados) {
    const actual = porConteo.get(f.id) ?? { cerradoEn: f.cerradoEn!, diferencia: 0 };
    actual.diferencia += ((f.contado ?? 0) - (f.teorico ?? 0)) * f.costo;
    porConteo.set(f.id, actual);
  }
  for (const [id, c] of porConteo) {
    if (Math.abs(c.diferencia) > umbrales.diferenciaConteoCentavos) {
      alertas.push({ clave: `conteo:${id}`, tipo: 'conteo', momento: c.cerradoEn.toISOString(), titulo: 'Conteo con diferencia grande', detalle: 'Ver el conteo en Stock', montoCentavos: Math.round(c.diferencia) });
    }
  }

  // Las mesas abiertas hace demasiado se miran ahora, no en el período.
  const abiertas = reducirSalon(todos);
  for (const c of abiertas.cuentas.values()) {
    const minutos = (Date.now() - new Date(c.abiertaEn).getTime()) / 60_000;
    if (c.estado === 'abierta' && minutos > umbrales.minutosMesaAbierta) {
      alertas.push({ clave: `abierta:${c.id}`, tipo: 'mesa', momento: c.abiertaEn, titulo: 'Cuenta abierta hace demasiado', detalle: `${Math.floor(minutos / 60)} h · ${quien[c.mozoId] ?? ''}`, montoCentavos: totalCuenta(c) });
    }
  }

  const claves = alertas.map((a) => a.clave);
  const vistas = claves.length ? new Set((await db.select({ clave: alertasVistas.clave }).from(alertasVistas).where(inArray(alertasVistas.clave, claves))).map((v) => v.clave)) : new Set<string>();
  return alertas.map((a) => ({ ...a, vista: vistas.has(a.clave) })).sort((a, b) => b.momento.localeCompare(a.momento));
}

export async function marcarAlertaVista(actor: UsuarioSesion, clave: string) {
  if (!puede(actor, 'control.ver')) throw new ErrorAcceso(403, 'No tenés permiso');
  await db.insert(alertasVistas).values({ clave, vistaPorId: actor.id }).onConflictDoNothing();
}

export async function leerConfiguracionControl(actor: UsuarioSesion) {
  if (!puede(actor, 'control.configurar')) throw new ErrorAcceso(403, 'No tenés permiso');
  const [motivos, reglas, umbrales] = await Promise.all([
    db.select().from(motivosAutorizacion).where(isNull(motivosAutorizacion.archivadoEn)).orderBy(asc(motivosAutorizacion.orden)),
    db.select().from(reglasAutorizacion),
    leerUmbrales(),
  ]);
  const guardadas = Object.fromEntries(reglas.filter((r) => esAccionAutorizable(r.accion)).map((r) => [r.accion, r.roles.filter(esRol)]));
  return {
    motivos: motivos.filter((m) => esAccionAutorizable(m.accion)).map((m) => ({ id: m.id, accion: m.accion as AccionAutorizable, texto: m.texto })),
    reglas: { ...REGLAS_POR_DEFECTO, ...guardadas } as ReglasAutorizacion,
    umbrales,
  };
}

export async function guardarConfiguracionControl(
  actor: UsuarioSesion,
  datos: { reglas: Record<AccionAutorizable, Rol[]>; umbrales: Umbrales; motivos: { id: string | null; accion: AccionAutorizable; texto: string }[] },
  ip: string | null,
) {
  if (!puede(actor, 'control.configurar')) throw new ErrorAcceso(403, 'No tenés permiso');
  await db.transaction(async (tx) => {
    for (const [accion, roles] of Object.entries(datos.reglas)) {
      await tx.insert(reglasAutorizacion).values({ accion, roles }).onConflictDoUpdate({ target: reglasAutorizacion.accion, set: { roles } });
    }
    await tx
      .insert(configuracionControl)
      .values({ id: 1, umbrales: { ...datos.umbrales } })
      .onConflictDoUpdate({ target: configuracionControl.id, set: { umbrales: { ...datos.umbrales }, actualizadoEn: new Date() } });

    const actuales = await tx.select().from(motivosAutorizacion).where(isNull(motivosAutorizacion.archivadoEn));
    const ahora = new Date();
    for (const actual of actuales) {
      const pedido = datos.motivos.find((m) => m.id === actual.id);
      // Un motivo usado por eventos viejos no se edita: se archiva y se crea otro.
      if (!pedido || pedido.texto !== actual.texto) await tx.update(motivosAutorizacion).set({ archivadoEn: ahora }).where(eq(motivosAutorizacion.id, actual.id));
    }
    const nuevos = datos.motivos.filter((m) => {
      const actual = actuales.find((a) => a.id === m.id);
      return !actual || actual.texto !== m.texto;
    });
    if (nuevos.length) await tx.insert(motivosAutorizacion).values(nuevos.map((m, orden) => ({ accion: m.accion, texto: m.texto, orden })));
  });
  await auditar({ accion: 'control.modificado', actor, objetivoTipo: 'control', objetivoId: 'configuracion', detalle: { umbrales: datos.umbrales, reglas: datos.reglas }, ip });
}

