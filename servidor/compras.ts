import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { adjuntos, compras, depositos, insumos, lineasCompra, pagosProveedor, proveedores, revisionesCompra, usuarios } from '@/db/esquema';
import { NOMBRE_FORMA_PAGO } from '@/dominio/compras';
import { cuentaCorriente, movimientosCuenta, type CuentaCorriente, type EstadoFactura } from '@/dominio/cuenta-corriente';
import { puede, type Accion } from '@/dominio/permisos';
import type { UnidadBase } from '@/dominio/stock';
import { ErrorAcceso, ErrorDominio, type UsuarioSesion } from '@/lib/sesion';
import { normalizar } from '@/lib/texto';
import { auditar } from './auditoria';
import { validarAdjunto } from './fotos';
import { revertirStockDeCompra } from './stock';

export const FORMAS_PAGO = ['efectivo', 'transferencia', 'mercado_pago', 'cheque', 'tarjeta'] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

export type EstadoComprobante = EstadoFactura | 'nota_credito';

function exigir(actor: UsuarioSesion, accion: Accion = 'stock.administrar') {
  if (!puede(actor, accion)) throw new ErrorAcceso(403, 'No tenés permiso para esto');
}

async function registrar(actor: UsuarioSesion, que: string, id: string, detalle: Record<string, unknown>, ip: string | null) {
  await auditar({ accion: 'compra.modificada', actor, objetivoTipo: 'compra', objetivoId: id, detalle: { que, ...detalle }, ip });
}

/**
 * Comprobantes y pagos de todos los proveedores con su cuenta corriente ya
 * calculada. Son pocos cientos por año: traerlos todos y calcular es más
 * simple y más seguro que guardar saldos que después hay que mantener.
 */
async function leerCuentas(proveedorId?: string) {
  const [filasCompras, filasPagos, filasProveedores, filasAdjuntos] = await Promise.all([
    db.select().from(compras).where(proveedorId ? eq(compras.proveedorId, proveedorId) : undefined),
    db.select().from(pagosProveedor).where(proveedorId ? eq(pagosProveedor.proveedorId, proveedorId) : undefined),
    db.select({ id: proveedores.id, nombre: proveedores.nombre, cuit: proveedores.cuit }).from(proveedores),
    db.select({ duenoTipo: adjuntos.duenoTipo, duenoId: adjuntos.duenoId }).from(adjuntos),
  ]);
  const porProveedor = new Map<string, CuentaCorriente>();
  for (const p of filasProveedores) {
    const propias = filasCompras.filter((c) => c.proveedorId === p.id);
    const pagos = filasPagos.filter((x) => x.proveedorId === p.id);
    if (!propias.length && !pagos.length) continue;
    porProveedor.set(
      p.id,
      cuentaCorriente(
        propias.map((c) => ({ id: c.id, tipo: c.tipo, fecha: c.fecha, registradaEn: c.registradaEn.toISOString(), totalCentavos: c.totalCentavos, enReclamo: c.enReclamo, anulada: c.anuladaEn !== null })),
        pagos.map((x) => ({ id: x.id, fecha: x.fecha, registradoEn: x.registradoEn.toISOString(), importeCentavos: x.importeCentavos, anulado: x.anuladoEn !== null })),
      ),
    );
  }
  return {
    compras: filasCompras,
    pagos: filasPagos,
    proveedor: new Map(filasProveedores.map((p) => [p.id, p])),
    porProveedor,
    conAdjunto: new Set(filasAdjuntos.map((a) => `${a.duenoTipo}:${a.duenoId}`)),
  };
}

function estadoDe(c: typeof compras.$inferSelect, cuentas: Awaited<ReturnType<typeof leerCuentas>>): { estado: EstadoComprobante; pagadoCentavos: number; saldoCentavos: number } {
  if (c.tipo === 'nota_credito') return { estado: c.anuladaEn ? 'anulada' : 'nota_credito', pagadoCentavos: 0, saldoCentavos: 0 };
  const situacion = cuentas.porProveedor.get(c.proveedorId)?.facturas.get(c.id);
  return { estado: situacion?.estado ?? 'pendiente', pagadoCentavos: situacion?.pagadoCentavos ?? 0, saldoCentavos: situacion?.saldoCentavos ?? c.totalCentavos };
}

export type FiltroEstado = 'todas' | 'impagas' | 'pagadas' | 'reclamo' | 'anuladas';

const COINCIDE: Record<FiltroEstado, (estado: EstadoComprobante) => boolean> = {
  todas: () => true,
  impagas: (e) => e === 'pendiente' || e === 'parcial',
  pagadas: (e) => e === 'pagada',
  reclamo: (e) => e === 'reclamo',
  anuladas: (e) => e === 'anulada',
};

/**
 * Los comprobantes de un período, filtrados y paginados acá. «Impagas»
 * ignora el período: una factura de hace dos meses que sigue sin pagar tiene
 * que aparecer cuando se busca qué se debe.
 */
export async function listarFacturas(
  actor: UsuarioSesion,
  filtro: { desde: string; hasta: string; estado: FiltroEstado; buscar: string; pagina: number; porPagina: number },
) {
  exigir(actor);
  const cuentas = await leerCuentas();
  const buscado = normalizar(filtro.buscar);
  const filas = cuentas.compras
    .filter((c) => filtro.estado === 'impagas' || (c.fecha >= filtro.desde && c.fecha <= filtro.hasta))
    .map((c) => ({ c, ...estadoDe(c, cuentas) }))
    .filter((f) => COINCIDE[filtro.estado](f.estado))
    .filter((f) => {
      if (!buscado) return true;
      const [anio, mes, dia] = f.c.fecha.split('-');
      return normalizar(`${cuentas.proveedor.get(f.c.proveedorId)?.nombre ?? ''} ${f.c.numeroFactura} ${f.c.fecha} ${dia}/${mes}/${anio}`).includes(buscado);
    })
    .sort((a, b) => b.c.fecha.localeCompare(a.c.fecha) || b.c.registradaEn.getTime() - a.c.registradaEn.getTime());

  const totalPaginas = Math.max(1, Math.ceil(filas.length / filtro.porPagina));
  const pagina = Math.min(totalPaginas, Math.max(1, filtro.pagina));
  return {
    pagina,
    totalPaginas,
    totalFilas: filas.length,
    filas: filas.slice((pagina - 1) * filtro.porPagina, pagina * filtro.porPagina).map((f) => ({
      id: f.c.id,
      tipo: f.c.tipo,
      fecha: f.c.fecha,
      numeroFactura: f.c.numeroFactura,
      proveedor: cuentas.proveedor.get(f.c.proveedorId)?.nombre ?? '—',
      totalCentavos: f.c.totalCentavos,
      pagadoCentavos: f.pagadoCentavos,
      saldoCentavos: f.saldoCentavos,
      estado: f.estado,
      tieneAdjunto: cuentas.conAdjunto.has(`compra:${f.c.id}`),
    })),
  };
}

export type ListadoFacturas = Awaited<ReturnType<typeof listarFacturas>>;

/** Las cifras de arriba: lo facturado y pagado en el período, y lo que se debe hoy. */
export async function resumenCompras(actor: UsuarioSesion, desde: string, hasta: string) {
  exigir(actor);
  const cuentas = await leerCuentas();
  const enPeriodo = (fecha: string) => fecha >= desde && fecha <= hasta;
  const gastoCentavos = cuentas.compras
    .filter((c) => !c.anuladaEn && enPeriodo(c.fecha))
    .reduce((s, c) => s + (c.tipo === 'factura' ? c.totalCentavos : -c.totalCentavos), 0);
  const pagadoCentavos = cuentas.pagos.filter((p) => !p.anuladoEn && enPeriodo(p.fecha)).reduce((s, p) => s + p.importeCentavos, 0);
  let deudaCentavos = 0;
  let enReclamoCentavos = 0;
  let saldoAFavorCentavos = 0;
  for (const cuenta of cuentas.porProveedor.values()) {
    deudaCentavos += cuenta.deudaCentavos;
    enReclamoCentavos += cuenta.enReclamoCentavos;
    saldoAFavorCentavos += cuenta.saldoAFavorCentavos;
  }
  return { gastoCentavos, pagadoCentavos, deudaCentavos, enReclamoCentavos, saldoAFavorCentavos };
}

/** Cuánto se le debe a cada uno, de mayor a menor. */
export async function cuentasDeProveedores(actor: UsuarioSesion, filtro: { buscar: string; pagina: number; porPagina: number }) {
  exigir(actor);
  const cuentas = await leerCuentas();
  const buscado = normalizar(filtro.buscar);
  const filas = [...cuentas.porProveedor.entries()]
    .filter(([id]) => !buscado || normalizar(cuentas.proveedor.get(id)?.nombre ?? '').includes(buscado))
    .map(([id, cuenta]) => {
      const propias = cuentas.compras.filter((c) => c.proveedorId === id && !c.anuladaEn);
      const situaciones = [...cuenta.facturas.values()];
      return {
        id,
        nombre: cuentas.proveedor.get(id)?.nombre ?? '—',
        facturadoCentavos: propias.reduce((s, c) => s + (c.tipo === 'factura' ? c.totalCentavos : -c.totalCentavos), 0),
        pagadoCentavos: cuentas.pagos.filter((p) => p.proveedorId === id && !p.anuladoEn).reduce((s, p) => s + p.importeCentavos, 0),
        deudaCentavos: cuenta.deudaCentavos,
        saldoAFavorCentavos: cuenta.saldoAFavorCentavos,
        impagas: situaciones.filter((s) => s.estado === 'pendiente' || s.estado === 'parcial').length,
        enReclamo: situaciones.filter((s) => s.estado === 'reclamo').length,
      };
    })
    .sort((a, b) => b.deudaCentavos - a.deudaCentavos || a.nombre.localeCompare(b.nombre));

  const totalPaginas = Math.max(1, Math.ceil(filas.length / filtro.porPagina));
  const pagina = Math.min(totalPaginas, Math.max(1, filtro.pagina));
  return { pagina, totalPaginas, totalFilas: filas.length, filas: filas.slice((pagina - 1) * filtro.porPagina, pagina * filtro.porPagina) };
}

export type CuentasDeProveedores = Awaited<ReturnType<typeof cuentasDeProveedores>>;


/** El resumen de cuenta de un proveedor, con el saldo renglón por renglón, y sus pagos (también los anulados). */
export async function resumenDeCuenta(actor: UsuarioSesion, proveedorId: string) {
  exigir(actor);
  const cuentas = await leerCuentas(proveedorId);
  const proveedor = cuentas.proveedor.get(proveedorId);
  if (!proveedor) throw new ErrorDominio('El proveedor no existe');
  const cuenta = cuentas.porProveedor.get(proveedorId);
  const comprobantes = cuentas.compras.map((c) => ({ id: c.id, tipo: c.tipo, fecha: c.fecha, registradaEn: c.registradaEn.toISOString(), totalCentavos: c.totalCentavos, enReclamo: c.enReclamo, anulada: c.anuladaEn !== null }));
  const pagos = cuentas.pagos.map((p) => ({ id: p.id, fecha: p.fecha, registradoEn: p.registradoEn.toISOString(), importeCentavos: p.importeCentavos, anulado: p.anuladoEn !== null }));
  const compra = new Map(cuentas.compras.map((c) => [c.id, c]));
  const pago = new Map(cuentas.pagos.map((p) => [p.id, p]));

  const vigentes = cuentas.compras.filter((c) => !c.anuladaEn);
  const pagosVigentes = cuentas.pagos.filter((p) => !p.anuladoEn);
  const impagas = vigentes.filter((c) => c.tipo === 'factura' && ['pendiente', 'parcial'].includes(cuenta?.facturas.get(c.id)?.estado ?? ''));

  return {
    proveedor: { id: proveedor.id, nombre: proveedor.nombre, cuit: proveedor.cuit },
    deudaCentavos: cuenta?.deudaCentavos ?? 0,
    saldoAFavorCentavos: cuenta?.saldoAFavorCentavos ?? 0,
    enReclamoCentavos: cuenta?.enReclamoCentavos ?? 0,
    facturadoCentavos: vigentes.reduce((s, c) => s + (c.tipo === 'factura' ? c.totalCentavos : -c.totalCentavos), 0),
    pagadoCentavos: pagosVigentes.reduce((s, p) => s + p.importeCentavos, 0),
    cantidadFacturas: vigentes.filter((c) => c.tipo === 'factura').length,
    impagas: impagas.length,
    // Lo que más pesa al decidir a quién pagar primero: cuánto hace que se le debe.
    impagaMasVieja: impagas.map((c) => c.fecha).sort()[0] ?? null,
    ultimoPago: pagosVigentes.map((p) => p.fecha).sort().at(-1) ?? null,
    primeraCompra: vigentes.map((c) => c.fecha).sort()[0] ?? null,
    facturas: [...cuentas.compras]
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.registradaEn.getTime() - a.registradaEn.getTime())
      .map((c) => ({
        id: c.id,
        tipo: c.tipo,
        fecha: c.fecha,
        numeroFactura: c.numeroFactura,
        totalCentavos: c.totalCentavos,
        ...estadoDe(c, cuentas),
        tieneAdjunto: cuentas.conAdjunto.has(`compra:${c.id}`),
      })),
    movimientos: movimientosCuenta(comprobantes, pagos).map((m) => {
      const c = compra.get(m.id);
      const p = pago.get(m.id);
      return {
        ...m,
        detalle: c ? `${c.tipo === 'factura' ? 'Factura' : 'Nota de crédito'} ${c.numeroFactura}` : `Pago · ${NOMBRE_FORMA_PAGO[p!.forma]}`,
        estado: c?.tipo === 'factura' ? (cuenta?.facturas.get(c.id)?.estado ?? null) : null,
      };
    }),
    pagos: [...cuentas.pagos]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((p) => ({
        id: p.id,
        fecha: p.fecha,
        importeCentavos: p.importeCentavos,
        forma: p.forma,
        observacion: p.observacion,
        anulado: p.anuladoEn !== null,
        motivoAnulacion: p.motivoAnulacion,
        tieneAdjunto: cuentas.conAdjunto.has(`pago_proveedor:${p.id}`),
        // A qué facturas fue: el reparto calculado, para poder explicarlo.
        cubre: (cuenta?.imputaciones ?? [])
          .filter((i) => i.origenId === p.id)
          .map((i) => ({ numeroFactura: compra.get(i.facturaId)?.numeroFactura ?? '—', importeCentavos: i.importeCentavos })),
      })),
  };
}

export type ResumenDeCuenta = Awaited<ReturnType<typeof resumenDeCuenta>>;

/** Todo lo de un comprobante para su ficha: qué lo cubrió, qué trajo, quién lo tocó. */
export async function fichaFactura(actor: UsuarioSesion, id: string) {
  exigir(actor);
  const [fila] = await db.select().from(compras).where(eq(compras.id, id));
  if (!fila) throw new ErrorDominio('El comprobante no existe');
  const cuentas = await leerCuentas(fila.proveedorId);
  const [filasLineas, filasRevisiones, filasUsuarios, deposito] = await Promise.all([
    db
      .select({ nombre: insumos.nombre, unidad: insumos.unidad, cantidadBase: lineasCompra.cantidadBase, costoCentavos: lineasCompra.costoCentavos })
      .from(lineasCompra)
      .innerJoin(insumos, eq(insumos.id, lineasCompra.insumoId))
      .where(eq(lineasCompra.compraId, id)),
    db.select().from(revisionesCompra).where(eq(revisionesCompra.compraId, id)).orderBy(asc(revisionesCompra.revision)),
    db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios),
    fila.depositoId ? db.select({ nombre: depositos.nombre }).from(depositos).where(eq(depositos.id, fila.depositoId)) : Promise.resolve([]),
  ]);
  const persona = (uid: string | null) => (uid ? (filasUsuarios.find((u) => u.id === uid)?.nombre ?? '—') : '—');
  const situacion = cuentas.porProveedor.get(fila.proveedorId)?.facturas.get(id);
  const pago = new Map(cuentas.pagos.map((p) => [p.id, p]));
  const nota = new Map(cuentas.compras.map((c) => [c.id, c]));

  return {
    id: fila.id,
    tipo: fila.tipo,
    proveedorId: fila.proveedorId,
    proveedor: cuentas.proveedor.get(fila.proveedorId)?.nombre ?? '—',
    numeroFactura: fila.numeroFactura,
    fecha: fila.fecha,
    totalCentavos: fila.totalCentavos,
    observacion: fila.observacion,
    enReclamo: fila.enReclamo,
    revision: fila.revision,
    deposito: deposito[0]?.nombre ?? null,
    // Sin autor: vino importada del sistema anterior, que no tenía los mismos usuarios.
    registradaPor: fila.registradaPorId ? persona(fila.registradaPorId) : null,
    registradaEn: fila.registradaEn.toISOString(),
    anulada: fila.anuladaEn ? { en: fila.anuladaEn.toISOString(), por: persona(fila.anuladaPorId), motivo: fila.motivoAnulacion ?? '' } : null,
    ...estadoDe(fila, cuentas),
    tieneAdjunto: cuentas.conAdjunto.has(`compra:${id}`),
    lineas: filasLineas.map((l) => ({ nombre: l.nombre, unidad: l.unidad as UnidadBase, cantidadBase: l.cantidadBase, costoCentavos: l.costoCentavos })),
    cubiertaPor: (situacion?.imputaciones ?? []).map((i) => {
      const p = pago.get(i.origenId);
      return p
        ? { fecha: p.fecha, detalle: `Pago · ${NOMBRE_FORMA_PAGO[p.forma]}`, importeCentavos: i.importeCentavos }
        : { fecha: nota.get(i.origenId)?.fecha ?? '', detalle: `Nota de crédito ${nota.get(i.origenId)?.numeroFactura ?? ''}`, importeCentavos: i.importeCentavos };
    }),
    revisiones: filasRevisiones.map((r) => ({ revision: r.revision, anterior: r.anterior, por: persona(r.corregidaPorId), en: r.corregidaEn.toISOString() })),
  };
}

export type FichaFactura = Awaited<ReturnType<typeof fichaFactura>>;

export interface DatosCorreccion {
  proveedorId: string;
  numeroFactura: string;
  fecha: string;
  totalCentavos: number;
  observacion: string | null;
}

/**
 * Corregir no pisa: lo que había queda en `revisiones_compra` con quién y
 * cuándo, y la factura sube de revisión. Como el reparto de pagos se calcula,
 * cambiar el total o la fecha reacomoda la cuenta sola.
 */
export async function corregirFactura(actor: UsuarioSesion, id: string, datos: DatosCorreccion, ip: string | null) {
  exigir(actor);
  if (datos.totalCentavos <= 0) throw new ErrorDominio('Poné el importe total');
  await db.transaction(async (tx) => {
    const [actual] = await tx.select().from(compras).where(eq(compras.id, id)).for('update');
    if (!actual) throw new ErrorDominio('El comprobante no existe');
    if (actual.anuladaEn) throw new ErrorDominio('Está anulado: no se corrige');
    const anterior = { proveedorId: actual.proveedorId, numeroFactura: actual.numeroFactura, fecha: actual.fecha, totalCentavos: actual.totalCentavos, observacion: actual.observacion };
    await tx.insert(revisionesCompra).values({ compraId: id, revision: actual.revision, anterior, corregidaPorId: actor.id });
    await tx
      .update(compras)
      .set({ proveedorId: datos.proveedorId, numeroFactura: datos.numeroFactura, fecha: datos.fecha, totalCentavos: datos.totalCentavos, observacion: datos.observacion || null, revision: actual.revision + 1 })
      .where(eq(compras.id, id));
  });
  await registrar(actor, 'compra.corregida', id, { numero: datos.numeroFactura, total: datos.totalCentavos }, ip);
}

export async function marcarReclamo(actor: UsuarioSesion, id: string, enReclamo: boolean, ip: string | null) {
  exigir(actor);
  const [fila] = await db.update(compras).set({ enReclamo }).where(and(eq(compras.id, id), eq(compras.tipo, 'factura'), isNull(compras.anuladaEn))).returning({ id: compras.id });
  if (!fila) throw new ErrorDominio('La factura no existe o está anulada');
  await registrar(actor, enReclamo ? 'compra.en_reclamo' : 'compra.reclamo_resuelto', id, {}, ip);
}

/** Anular no borra: queda con motivo, y si trajo mercadería, la mercadería sale del depósito. */
export async function anularFactura(actor: UsuarioSesion, id: string, motivo: string, ip: string | null) {
  exigir(actor, 'compras.anular');
  await db.transaction(async (tx) => {
    const [fila] = await tx
      .update(compras)
      .set({ anuladaEn: new Date(), anuladaPorId: actor.id, motivoAnulacion: motivo })
      .where(and(eq(compras.id, id), isNull(compras.anuladaEn)))
      .returning({ depositoId: compras.depositoId });
    if (!fila) throw new ErrorDominio('El comprobante no existe o ya estaba anulado');
    if (fila.depositoId) await revertirStockDeCompra(tx, id, actor.id);
  });
  await registrar(actor, 'compra.anulada', id, { motivo }, ip);
}

export async function registrarPago(
  actor: UsuarioSesion,
  datos: { proveedorId: string; fecha: string; importeCentavos: number; forma: FormaPago; observacion: string | null },
  ip: string | null,
) {
  exigir(actor);
  if (datos.importeCentavos <= 0) throw new ErrorDominio('Poné el importe pagado');
  const [proveedor] = await db.select({ id: proveedores.id }).from(proveedores).where(eq(proveedores.id, datos.proveedorId));
  if (!proveedor) throw new ErrorDominio('El proveedor no existe');
  const [pago] = await db
    .insert(pagosProveedor)
    .values({ ...datos, observacion: datos.observacion || null, registradoPorId: actor.id })
    .returning({ id: pagosProveedor.id });
  await registrar(actor, 'pago.registrado', pago!.id, { proveedorId: datos.proveedorId, importe: datos.importeCentavos, forma: datos.forma }, ip);
  return pago!.id;
}

export async function anularPago(actor: UsuarioSesion, id: string, motivo: string, ip: string | null) {
  exigir(actor, 'compras.anular');
  const [fila] = await db
    .update(pagosProveedor)
    .set({ anuladoEn: new Date(), anuladoPorId: actor.id, motivoAnulacion: motivo })
    .where(and(eq(pagosProveedor.id, id), isNull(pagosProveedor.anuladoEn)))
    .returning({ id: pagosProveedor.id });
  if (!fila) throw new ErrorDominio('El pago no existe o ya estaba anulado');
  await registrar(actor, 'pago.anulado', id, { motivo }, ip);
}

export type DuenoAdjunto = 'compra' | 'pago_proveedor';

export async function guardarAdjunto(actor: UsuarioSesion, duenoTipo: DuenoAdjunto, duenoId: string, contenido: Buffer, ip: string | null) {
  exigir(actor);
  const tipo = validarAdjunto(contenido);
  const tabla = duenoTipo === 'compra' ? compras : pagosProveedor;
  const [dueno] = await db.select({ id: tabla.id }).from(tabla).where(eq(tabla.id, duenoId));
  if (!dueno) throw new ErrorDominio('No existe a qué adjuntarlo');
  await db
    .insert(adjuntos)
    .values({ duenoTipo, duenoId, tipo, contenido, subidoPorId: actor.id })
    .onConflictDoUpdate({ target: [adjuntos.duenoTipo, adjuntos.duenoId], set: { tipo, contenido, subidoPorId: actor.id, subidoEn: new Date() } });
  await registrar(actor, 'adjunto.subido', duenoId, { duenoTipo, bytes: contenido.length }, ip);
}

/** Las facturas son papeles de la plata del negocio: las ve quien administra compras, no cualquiera con sesión. */
export async function leerAdjunto(actor: UsuarioSesion, duenoTipo: DuenoAdjunto, duenoId: string) {
  exigir(actor);
  const [fila] = await db
    .select({ tipo: adjuntos.tipo, contenido: adjuntos.contenido })
    .from(adjuntos)
    .where(and(eq(adjuntos.duenoTipo, duenoTipo), eq(adjuntos.duenoId, duenoId)));
  return fila ?? null;
}

/** Para el selector de proveedores de los formularios. */
export async function proveedoresActivos(actor: UsuarioSesion) {
  exigir(actor);
  return db.select({ id: proveedores.id, nombre: proveedores.nombre }).from(proveedores).where(isNull(proveedores.archivadoEn)).orderBy(asc(proveedores.nombre));
}

