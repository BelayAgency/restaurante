import 'server-only';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db/cliente';
import {
  compras,
  conteos,
  depositos,
  eventos,
  historialCostos,
  insumos,
  lineasCompra,
  lineasConteo,
  lineasReceta,
  movimientosStock,
  preciosProducto,
  presentaciones,
  productos,
  proveedores,
  recetas,
} from '@/db/esquema';
import type { DatosDe, EventoNuevo } from '@/dominio/eventos';
import { puede, type Accion } from '@/dominio/permisos';
import { consumoDeReceta, costoPorcion, costoPromedio, foodCostPorcentaje, type UnidadBase } from '@/dominio/stock';
import { ErrorAcceso, ErrorDominio, type UsuarioSesion } from '@/lib/sesion';
import { auditar } from './auditoria';

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TipoMovimiento = (typeof movimientosStock.$inferInsert)['tipo'];

function exigir(actor: UsuarioSesion, accion: Accion = 'stock.administrar') {
  if (!puede(actor, accion)) throw new ErrorAcceso(403, 'No tenés permiso para esto');
}

async function registrar(actor: UsuarioSesion, que: string, id: string, detalle: Record<string, unknown>, ip: string | null) {
  await auditar({ accion: 'stock.modificado', actor, objetivoTipo: 'stock', objetivoId: id, detalle: { que, ...detalle }, ip });
}

/** Stock de un insumo en un depósito (o en todos), sumando sus movimientos. */
async function stockDe(tx: Transaccion | typeof db, insumoId: string, depositoId?: string): Promise<number> {
  const [fila] = await tx
    .select({ total: sql<string>`coalesce(sum(${movimientosStock.cantidad}), 0)` })
    .from(movimientosStock)
    .where(and(eq(movimientosStock.insumoId, insumoId), depositoId ? eq(movimientosStock.depositoId, depositoId) : undefined));
  return Number(fila?.total ?? 0);
}

async function moverStock(
  tx: Transaccion,
  datos: {
    insumoId: string;
    depositoId: string;
    tipo: TipoMovimiento;
    cantidad: number;
    costoUnitario: number;
    actorId: string | null;
    motivo?: string | null;
    referenciaTipo?: string;
    referenciaId?: string;
    ocurridoEn?: Date;
  },
) {
  await tx
    .insert(movimientosStock)
    .values({ ...datos, ocurridoEn: datos.ocurridoEn ?? new Date() })
    .onConflictDoNothing();
}

async function actualizarCosto(tx: Transaccion, insumoId: string, costoUnitario: number, motivo: string, referenciaId: string) {
  await tx.update(insumos).set({ costoUnitario }).where(eq(insumos.id, insumoId));
  await tx.insert(historialCostos).values({ insumoId, costoUnitario, motivo, referenciaId });
}

export async function leerStock(actor: UsuarioSesion) {
  exigir(actor, 'stock.contar');
  const [filasInsumos, filasDepositos, filasPresentaciones, totales, filasProveedores] = await Promise.all([
    db.select().from(insumos).where(isNull(insumos.archivadoEn)).orderBy(asc(insumos.nombre)),
    db.select().from(depositos).where(isNull(depositos.archivadoEn)).orderBy(asc(depositos.nombre)),
    db.select().from(presentaciones).where(isNull(presentaciones.archivadoEn)),
    db
      .select({
        insumoId: movimientosStock.insumoId,
        depositoId: movimientosStock.depositoId,
        cantidad: sql<string>`sum(${movimientosStock.cantidad})`,
      })
      .from(movimientosStock)
      .groupBy(movimientosStock.insumoId, movimientosStock.depositoId),
    db.select().from(proveedores).where(isNull(proveedores.archivadoEn)).orderBy(asc(proveedores.nombre)),
  ]);

  return {
    depositos: filasDepositos.map((d) => ({ id: d.id, nombre: d.nombre, deVenta: d.deVenta })),
    proveedores: filasProveedores.map((p) => ({ id: p.id, nombre: p.nombre, cuit: p.cuit })),
    insumos: filasInsumos.map((i) => {
      const porDeposito = Object.fromEntries(totales.filter((t) => t.insumoId === i.id).map((t) => [t.depositoId, Number(t.cantidad)]));
      const total = Object.values(porDeposito).reduce((s, c) => s + c, 0);
      return {
        id: i.id,
        nombre: i.nombre,
        tipo: i.tipo,
        unidad: i.unidad as UnidadBase,
        stockMinimo: i.stockMinimo,
        costoUnitario: i.costoUnitario,
        porDeposito,
        total,
        bajoMinimo: i.stockMinimo > 0 && total < i.stockMinimo,
        presentaciones: filasPresentaciones.filter((p) => p.insumoId === i.id).map((p) => ({ id: p.id, nombre: p.nombre, cantidadBase: p.cantidadBase })),
      };
    }),
  };
}

export type Stock = Awaited<ReturnType<typeof leerStock>>;

export interface DatosInsumo {
  id: string | null;
  nombre: string;
  tipo: 'compra' | 'preparacion';
  unidad: UnidadBase;
  stockMinimo: number;
  presentaciones: { id: string | null; nombre: string; cantidadBase: number }[];
}

export async function guardarInsumo(actor: UsuarioSesion, datos: DatosInsumo, ip: string | null) {
  exigir(actor);
  const id = await db.transaction(async (tx) => {
    let id = datos.id;
    if (id) {
      // La unidad no se cambia: los movimientos viejos están en la anterior.
      await tx.update(insumos).set({ nombre: datos.nombre, stockMinimo: datos.stockMinimo }).where(eq(insumos.id, id));
    } else {
      const [fila] = await tx.insert(insumos).values({ nombre: datos.nombre, tipo: datos.tipo, unidad: datos.unidad, stockMinimo: datos.stockMinimo }).returning({ id: insumos.id });
      id = fila!.id;
    }
    const actuales = await tx.select().from(presentaciones).where(and(eq(presentaciones.insumoId, id), isNull(presentaciones.archivadoEn)));
    for (const actual of actuales) {
      const pedida = datos.presentaciones.find((p) => p.id === actual.id);
      if (!pedida || pedida.cantidadBase !== actual.cantidadBase) {
        await tx.update(presentaciones).set({ archivadoEn: new Date() }).where(eq(presentaciones.id, actual.id));
      } else if (pedida.nombre !== actual.nombre) {
        await tx.update(presentaciones).set({ nombre: pedida.nombre }).where(eq(presentaciones.id, actual.id));
      }
    }
    const nuevas = datos.presentaciones.filter((p) => {
      const actual = actuales.find((a) => a.id === p.id);
      return !actual || actual.cantidadBase !== p.cantidadBase;
    });
    if (nuevas.length) await tx.insert(presentaciones).values(nuevas.map((p) => ({ insumoId: id, nombre: p.nombre, cantidadBase: p.cantidadBase })));
    return id;
  });
  await registrar(actor, datos.id ? 'insumo.editado' : 'insumo.creado', id, { nombre: datos.nombre }, ip);
  return id;
}

export async function archivarInsumo(actor: UsuarioSesion, id: string, ip: string | null) {
  exigir(actor);
  const enReceta = await db
    .select({ id: lineasReceta.id })
    .from(lineasReceta)
    .innerJoin(recetas, eq(recetas.id, lineasReceta.recetaId))
    .where(and(eq(lineasReceta.insumoId, id), isNull(recetas.archivadoEn)))
    .limit(1);
  if (enReceta.length) throw new ErrorDominio('El insumo está en una receta vigente: sacalo de la receta primero');
  await db.update(insumos).set({ archivadoEn: new Date() }).where(eq(insumos.id, id));
  await registrar(actor, 'insumo.archivado', id, {}, ip);
}

export async function guardarProveedor(actor: UsuarioSesion, datos: { id: string | null; nombre: string; cuit: string | null }, ip: string | null) {
  exigir(actor);
  if (datos.id) {
    await db.update(proveedores).set({ nombre: datos.nombre, cuit: datos.cuit }).where(eq(proveedores.id, datos.id));
    await registrar(actor, 'proveedor.editado', datos.id, datos, ip);
    return datos.id;
  }
  const [fila] = await db.insert(proveedores).values({ nombre: datos.nombre, cuit: datos.cuit }).returning({ id: proveedores.id });
  await registrar(actor, 'proveedor.creado', fila!.id, datos, ip);
  return fila!.id;
}

export async function leerRecetas(actor: UsuarioSesion) {
  exigir(actor);
  const [filasProductos, filasRecetas, filasLineas, filasInsumos] = await Promise.all([
    db
      .select({ id: productos.id, nombre: productos.nombre, precioCentavos: preciosProducto.precioCentavos })
      .from(productos)
      .innerJoin(preciosProducto, and(eq(preciosProducto.productoId, productos.id), isNull(preciosProducto.archivadoEn)))
      .where(isNull(productos.archivadoEn))
      .orderBy(asc(productos.nombre)),
    db.select().from(recetas).where(isNull(recetas.archivadoEn)),
    db.select().from(lineasReceta),
    db.select().from(insumos).where(isNull(insumos.archivadoEn)).orderBy(asc(insumos.nombre)),
  ]);
  const costo = new Map(filasInsumos.map((i) => [i.id, i.costoUnitario]));
  const lineasDe = (recetaId: string) =>
    filasLineas.filter((l) => l.recetaId === recetaId).map((l) => ({ insumoId: l.insumoId, cantidad: l.cantidad, mermaPorcentaje: l.mermaPorcentaje }));

  return {
    insumos: filasInsumos.map((i) => ({ id: i.id, nombre: i.nombre, unidad: i.unidad as UnidadBase, tipo: i.tipo, costoUnitario: i.costoUnitario })),
    productos: filasProductos.map((p) => {
      const receta = filasRecetas.find((r) => r.productoId === p.id);
      const lineas = receta ? lineasDe(receta.id) : [];
      const costoCentavos = receta ? costoPorcion(lineas, receta.rendimiento, (id) => costo.get(id) ?? 0) : null;
      return {
        id: p.id,
        nombre: p.nombre,
        precioCentavos: p.precioCentavos,
        lineas,
        costoCentavos,
        foodCost: costoCentavos === null ? null : foodCostPorcentaje(costoCentavos, p.precioCentavos),
      };
    }),
    preparaciones: filasInsumos
      .filter((i) => i.tipo === 'preparacion')
      .map((i) => {
        const receta = filasRecetas.find((r) => r.preparacionId === i.id);
        return { id: i.id, nombre: i.nombre, unidad: i.unidad as UnidadBase, rendimiento: receta?.rendimiento ?? 1, lineas: receta ? lineasDe(receta.id) : [] };
      }),
  };
}

export type Recetas = Awaited<ReturnType<typeof leerRecetas>>;

export async function guardarReceta(
  actor: UsuarioSesion,
  datos: { productoId: string | null; preparacionId: string | null; rendimiento: number; lineas: { insumoId: string; cantidad: number; mermaPorcentaje: number }[] },
  ip: string | null,
) {
  exigir(actor);
  if (!datos.productoId === !datos.preparacionId) throw new ErrorDominio('La receta es de un producto o de una preparación');
  if (datos.preparacionId && datos.lineas.some((l) => l.insumoId === datos.preparacionId)) throw new ErrorDominio('Una preparación no puede llevarse a sí misma');
  const id = await db.transaction(async (tx) => {
    const filtro = datos.productoId ? eq(recetas.productoId, datos.productoId) : eq(recetas.preparacionId, datos.preparacionId!);
    await tx.update(recetas).set({ archivadoEn: new Date() }).where(and(filtro, isNull(recetas.archivadoEn)));
    const [receta] = await tx
      .insert(recetas)
      .values({ productoId: datos.productoId, preparacionId: datos.preparacionId, rendimiento: datos.rendimiento, creadoPorId: actor.id })
      .returning({ id: recetas.id });
    if (datos.lineas.length) await tx.insert(lineasReceta).values(datos.lineas.map((l) => ({ ...l, recetaId: receta!.id })));
    return receta!.id;
  });
  await registrar(actor, 'receta.guardada', id, { productoId: datos.productoId, preparacionId: datos.preparacionId, lineas: datos.lineas.length }, ip);
}

async function recetaVigente(tx: Transaccion | typeof db, filtro: { productoId?: string; preparacionId?: string }, momento?: Date) {
  // La receta del momento: la vigente entonces, no la de hoy.
  const condicion = filtro.productoId ? eq(recetas.productoId, filtro.productoId) : eq(recetas.preparacionId, filtro.preparacionId!);
  const filas = await tx
    .select()
    .from(recetas)
    .where(and(condicion, momento ? lte(recetas.vigenteDesde, momento) : undefined))
    .orderBy(sql`${recetas.vigenteDesde} desc`)
    .limit(1);
  const receta = filas[0];
  if (!receta) return null;
  const lineas = await tx.select().from(lineasReceta).where(eq(lineasReceta.recetaId, receta.id));
  return { ...receta, lineas: lineas.map((l) => ({ insumoId: l.insumoId, cantidad: l.cantidad, mermaPorcentaje: l.mermaPorcentaje })) };
}

export interface DatosCompra {
  proveedorId: string;
  depositoId: string;
  numeroFactura: string;
  fecha: string;
  lineas: { insumoId: string; presentacionId: string | null; cantidadPresentaciones: number; costoCentavos: number }[];
}

/** La compra suma stock y recalcula el costo promedio de cada insumo. */
export async function registrarCompra(actor: UsuarioSesion, datos: DatosCompra, ip: string | null) {
  exigir(actor);
  const id = await db.transaction(async (tx) => {
    const totalCentavos = datos.lineas.reduce((s, l) => s + l.costoCentavos, 0);
    const [compra] = await tx
      .insert(compras)
      .values({ proveedorId: datos.proveedorId, depositoId: datos.depositoId, numeroFactura: datos.numeroFactura, fecha: datos.fecha, totalCentavos, registradaPorId: actor.id })
      .returning({ id: compras.id });
    for (const linea of datos.lineas) {
      const presentacion = linea.presentacionId ? await tx.query.presentaciones.findFirst({ where: eq(presentaciones.id, linea.presentacionId) }) : null;
      if (linea.presentacionId && presentacion?.insumoId !== linea.insumoId) throw new ErrorDominio('La presentación no es de ese insumo');
      const cantidadBase = linea.cantidadPresentaciones * (presentacion?.cantidadBase ?? 1);
      if (cantidadBase <= 0) throw new ErrorDominio('Cada línea necesita una cantidad');
      const costoNuevo = linea.costoCentavos / cantidadBase;
      const insumo = await tx.query.insumos.findFirst({ where: eq(insumos.id, linea.insumoId) });
      if (!insumo) throw new ErrorDominio('El insumo no existe');
      const stockPrevio = await stockDe(tx, linea.insumoId);
      await tx.insert(lineasCompra).values({ compraId: compra!.id, ...linea, cantidadBase });
      await moverStock(tx, {
        insumoId: linea.insumoId,
        depositoId: datos.depositoId,
        tipo: 'compra',
        cantidad: cantidadBase,
        costoUnitario: costoNuevo,
        actorId: actor.id,
        referenciaTipo: 'compra',
        referenciaId: `${compra!.id}:${linea.insumoId}:${linea.presentacionId ?? ''}`,
      });
      await actualizarCosto(tx, linea.insumoId, costoPromedio(stockPrevio, insumo.costoUnitario, cantidadBase, costoNuevo), 'compra', compra!.id);
    }
    return compra!.id;
  });
  await registrar(actor, 'compra.registrada', id, { factura: datos.numeroFactura, lineas: datos.lineas.length }, ip);
  return id;
}

export async function listarCompras(actor: UsuarioSesion) {
  exigir(actor);
  return db
    .select({
      id: compras.id,
      fecha: compras.fecha,
      numeroFactura: compras.numeroFactura,
      totalCentavos: compras.totalCentavos,
      proveedor: proveedores.nombre,
      deposito: depositos.nombre,
    })
    .from(compras)
    .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
    .innerJoin(depositos, eq(depositos.id, compras.depositoId))
    .orderBy(sql`${compras.fecha} desc, ${compras.registradaEn} desc`)
    .limit(100);
}

/** Elaborar una preparación: salen sus insumos según la receta y entra la preparación. */
export async function registrarProduccion(actor: UsuarioSesion, datos: { preparacionId: string; cantidad: number; depositoId: string }, ip: string | null) {
  exigir(actor);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const receta = await recetaVigente(tx, { preparacionId: datos.preparacionId });
    if (!receta || !receta.lineas.length) throw new ErrorDominio('La preparación no tiene receta');
    let costoTotal = 0;
    for (const [insumoId, cantidad] of consumoDeReceta(receta.lineas, receta.rendimiento, datos.cantidad)) {
      const insumo = await tx.query.insumos.findFirst({ where: eq(insumos.id, insumoId) });
      costoTotal += cantidad * (insumo?.costoUnitario ?? 0);
      await moverStock(tx, {
        insumoId,
        depositoId: datos.depositoId,
        tipo: 'produccion_salida',
        cantidad: -cantidad,
        costoUnitario: insumo?.costoUnitario ?? 0,
        actorId: actor.id,
        referenciaTipo: 'produccion',
        referenciaId: id,
      });
    }
    const preparacion = await tx.query.insumos.findFirst({ where: eq(insumos.id, datos.preparacionId) });
    const costoUnitario = costoTotal / datos.cantidad;
    const stockPrevio = await stockDe(tx, datos.preparacionId);
    await moverStock(tx, {
      insumoId: datos.preparacionId,
      depositoId: datos.depositoId,
      tipo: 'produccion_entrada',
      cantidad: datos.cantidad,
      costoUnitario,
      actorId: actor.id,
      referenciaTipo: 'produccion',
      referenciaId: id,
    });
    await actualizarCosto(tx, datos.preparacionId, costoPromedio(stockPrevio, preparacion?.costoUnitario ?? 0, datos.cantidad, costoUnitario), 'produccion', id);
  });
  await registrar(actor, 'produccion.registrada', id, datos, ip);
}

export type TipoSalida = 'merma' | 'vencimiento' | 'comida_personal';

/** Mermas, vencimientos y comida del personal: salidas con motivo, cada una con su nombre. */
export async function registrarSalida(
  actor: UsuarioSesion,
  datos: { tipo: TipoSalida; insumoId: string; depositoId: string; cantidad: number; motivo: string },
  ip: string | null,
) {
  exigir(actor);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const insumo = await tx.query.insumos.findFirst({ where: eq(insumos.id, datos.insumoId) });
    if (!insumo) throw new ErrorDominio('El insumo no existe');
    await moverStock(tx, {
      insumoId: datos.insumoId,
      depositoId: datos.depositoId,
      tipo: datos.tipo,
      cantidad: -datos.cantidad,
      costoUnitario: insumo.costoUnitario,
      actorId: actor.id,
      motivo: datos.motivo,
      referenciaTipo: 'salida',
      referenciaId: id,
    });
  });
  await registrar(actor, `salida.${datos.tipo}`, id, datos, ip);
}

export async function transferir(actor: UsuarioSesion, datos: { insumoId: string; desdeId: string; haciaId: string; cantidad: number }, ip: string | null) {
  exigir(actor);
  if (datos.desdeId === datos.haciaId) throw new ErrorDominio('Elegí dos depósitos distintos');
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const insumo = await tx.query.insumos.findFirst({ where: eq(insumos.id, datos.insumoId) });
    const costo = insumo?.costoUnitario ?? 0;
    const base = { insumoId: datos.insumoId, costoUnitario: costo, actorId: actor.id, referenciaTipo: 'transferencia', referenciaId: id };
    await moverStock(tx, { ...base, depositoId: datos.desdeId, tipo: 'transferencia_salida', cantidad: -datos.cantidad });
    await moverStock(tx, { ...base, depositoId: datos.haciaId, tipo: 'transferencia_entrada', cantidad: datos.cantidad });
  });
  await registrar(actor, 'transferencia', id, datos, ip);
}

/**
 * Lo que una venta debería haber sacado del depósito según la receta. Se
 * genera cuando el ítem sale a cocina, que es cuando se prepara. Idempotente:
 * el mismo ítem no descuenta dos veces aunque el evento llegue de nuevo.
 */
export async function registrarConsumoTeorico(evento: Extract<EventoNuevo, { tipo: 'items_enviados' }>) {
  const [deVenta] = await db.select().from(depositos).where(and(eq(depositos.deVenta, true), isNull(depositos.archivadoEn))).limit(1);
  if (!deVenta) return;
  const cargas = await db
    .select({ datos: eventos.datos })
    .from(eventos)
    .where(
      and(
        eq(eventos.tipo, 'item_agregado'),
        eq(eventos.resultado, 'aceptado'),
        inArray(sql<string>`${eventos.datos}->>'itemId'`, evento.datos.itemIds),
      ),
    );
  const momento = new Date(evento.creadoEnDispositivo);
  await db.transaction(async (tx) => {
    for (const { datos } of cargas) {
      const item = datos as DatosDe<'item_agregado'>;
      const receta = await recetaVigente(tx, { productoId: item.productoId }, momento);
      if (!receta) continue;
      for (const [insumoId, cantidad] of consumoDeReceta(receta.lineas, receta.rendimiento, item.cantidad)) {
        const insumo = await tx.query.insumos.findFirst({ where: eq(insumos.id, insumoId) });
        await moverStock(tx, {
          insumoId,
          depositoId: deVenta.id,
          tipo: 'venta_teorica',
          cantidad: -cantidad,
          costoUnitario: insumo?.costoUnitario ?? 0,
          actorId: evento.operadorId,
          referenciaTipo: 'item',
          referenciaId: item.itemId,
          ocurridoEn: momento,
        });
      }
    }
  });
}

export async function abrirConteo(actor: UsuarioSesion, datos: { depositoId: string; insumoIds: string[] | null }, ip: string | null) {
  exigir(actor, 'stock.contar');
  const elegidos = datos.insumoIds?.length
    ? datos.insumoIds
    : (await db.select({ id: insumos.id }).from(insumos).where(isNull(insumos.archivadoEn))).map((i) => i.id);
  if (!elegidos.length) throw new ErrorDominio('No hay insumos para contar');
  const id = await db.transaction(async (tx) => {
    const [conteo] = await tx
      .insert(conteos)
      .values({ depositoId: datos.depositoId, alcance: datos.insumoIds?.length ? 'parcial' : 'total', abiertoPorId: actor.id })
      .returning({ id: conteos.id });
    await tx.insert(lineasConteo).values(elegidos.map((insumoId) => ({ conteoId: conteo!.id, insumoId })));
    return conteo!.id;
  });
  await registrar(actor, 'conteo.abierto', id, { depositoId: datos.depositoId, insumos: elegidos.length }, ip);
  return id;
}

export async function listarConteos(actor: UsuarioSesion) {
  exigir(actor, 'stock.contar');
  return db
    .select({ id: conteos.id, alcance: conteos.alcance, abiertoEn: conteos.abiertoEn, cerradoEn: conteos.cerradoEn, deposito: depositos.nombre })
    .from(conteos)
    .innerJoin(depositos, eq(depositos.id, conteos.depositoId))
    .orderBy(sql`${conteos.abiertoEn} desc`)
    .limit(50);
}

/**
 * Lo que se muestra de un conteo. Abierto, sin el teórico: quien cuenta no
 * ve lo que debería haber. Cerrado, con la diferencia.
 */
export async function leerConteo(actor: UsuarioSesion, id: string) {
  exigir(actor, 'stock.contar');
  const conteo = await db.query.conteos.findFirst({ where: eq(conteos.id, id) });
  if (!conteo) throw new ErrorDominio('El conteo no existe');
  const lineas = await db
    .select({ insumoId: lineasConteo.insumoId, contado: lineasConteo.contado, teorico: lineasConteo.teorico, nombre: insumos.nombre, unidad: insumos.unidad, costoUnitario: insumos.costoUnitario })
    .from(lineasConteo)
    .innerJoin(insumos, eq(insumos.id, lineasConteo.insumoId))
    .where(eq(lineasConteo.conteoId, id))
    .orderBy(asc(insumos.nombre));
  const cerrado = conteo.cerradoEn !== null;
  const [deposito] = await db.select({ nombre: depositos.nombre }).from(depositos).where(eq(depositos.id, conteo.depositoId));
  return {
    id,
    deposito: deposito?.nombre ?? '',
    alcance: conteo.alcance,
    abiertoEn: conteo.abiertoEn.toISOString(),
    cerradoEn: conteo.cerradoEn?.toISOString() ?? null,
    lineas: lineas.map((l) => ({
      insumoId: l.insumoId,
      nombre: l.nombre,
      unidad: l.unidad as UnidadBase,
      contado: l.contado,
      teorico: cerrado ? l.teorico : null,
      diferenciaCentavos: cerrado && l.teorico !== null && l.contado !== null ? (l.contado - l.teorico) * l.costoUnitario : null,
    })),
  };
}

export async function cargarConteo(actor: UsuarioSesion, id: string, valores: { insumoId: string; contado: number | null }[]) {
  exigir(actor, 'stock.contar');
  const conteo = await db.query.conteos.findFirst({ where: eq(conteos.id, id) });
  if (!conteo || conteo.cerradoEn) throw new ErrorDominio('El conteo ya está cerrado');
  await db.transaction(async (tx) => {
    for (const v of valores) {
      await tx.update(lineasConteo).set({ contado: v.contado }).where(and(eq(lineasConteo.conteoId, id), eq(lineasConteo.insumoId, v.insumoId)));
    }
  });
}

/** Cierra el conteo: fija el teórico de ese momento y ajusta el stock a lo contado. */
export async function cerrarConteo(actor: UsuarioSesion, id: string, ip: string | null) {
  exigir(actor, 'stock.contar');
  const conteo = await db.query.conteos.findFirst({ where: eq(conteos.id, id) });
  if (!conteo || conteo.cerradoEn) throw new ErrorDominio('El conteo ya está cerrado');
  const lineas = await db.select().from(lineasConteo).where(eq(lineasConteo.conteoId, id));
  if (lineas.some((l) => l.contado === null)) throw new ErrorDominio('Faltan insumos por contar');
  await db.transaction(async (tx) => {
    for (const linea of lineas) {
      const teorico = await stockDe(tx, linea.insumoId, conteo.depositoId);
      await tx.update(lineasConteo).set({ teorico }).where(eq(lineasConteo.id, linea.id));
      const diferencia = linea.contado! - teorico;
      if (Math.abs(diferencia) < 0.0001) continue;
      const insumo = await tx.query.insumos.findFirst({ where: eq(insumos.id, linea.insumoId) });
      await moverStock(tx, {
        insumoId: linea.insumoId,
        depositoId: conteo.depositoId,
        tipo: 'ajuste_conteo',
        cantidad: diferencia,
        costoUnitario: insumo?.costoUnitario ?? 0,
        actorId: actor.id,
        referenciaTipo: 'conteo',
        referenciaId: id,
      });
    }
    await tx.update(conteos).set({ cerradoEn: new Date(), cerradoPorId: actor.id }).where(eq(conteos.id, id));
  });
  await registrar(actor, 'conteo.cerrado', id, {}, ip);
}

/**
 * Por insumo y período: lo que la receta dice que se vendió, lo que se dio de
 * baja con nombre (merma, vencimiento, personal) y lo que faltó en los
 * conteos sin explicación. Ese último es la plata que no se encuentra.
 */
export async function diferenciasDeStock(actor: UsuarioSesion, desde: string, hasta: string) {
  exigir(actor);
  const inicio = new Date(`${desde}T00:00:00-03:00`);
  const fin = new Date(`${hasta}T23:59:59.999-03:00`);
  const filas = await db
    .select({
      insumoId: movimientosStock.insumoId,
      tipo: movimientosStock.tipo,
      cantidad: sql<string>`sum(${movimientosStock.cantidad})`,
      valor: sql<string>`sum(${movimientosStock.cantidad} * ${movimientosStock.costoUnitario})`,
    })
    .from(movimientosStock)
    .where(and(gte(movimientosStock.ocurridoEn, inicio), lte(movimientosStock.ocurridoEn, fin)))
    .groupBy(movimientosStock.insumoId, movimientosStock.tipo);
  const filasInsumos = await db.select({ id: insumos.id, nombre: insumos.nombre, unidad: insumos.unidad }).from(insumos);

  const porInsumo = new Map<string, { nombre: string; unidad: UnidadBase; teorico: number; bajas: number; faltante: number; valorTeorico: number; valorBajas: number; valorFaltante: number }>();
  for (const f of filas) {
    const insumo = filasInsumos.find((i) => i.id === f.insumoId);
    if (!insumo) continue;
    const fila = porInsumo.get(f.insumoId) ?? { nombre: insumo.nombre, unidad: insumo.unidad as UnidadBase, teorico: 0, bajas: 0, faltante: 0, valorTeorico: 0, valorBajas: 0, valorFaltante: 0 };
    const cantidad = -Number(f.cantidad);
    const valor = -Number(f.valor);
    if (f.tipo === 'venta_teorica') {
      fila.teorico += cantidad;
      fila.valorTeorico += valor;
    } else if (f.tipo === 'merma' || f.tipo === 'vencimiento' || f.tipo === 'comida_personal') {
      fila.bajas += cantidad;
      fila.valorBajas += valor;
    } else if (f.tipo === 'ajuste_conteo') {
      // Un ajuste negativo es faltante; uno positivo, sobrante (que también delata algo).
      fila.faltante += cantidad;
      fila.valorFaltante += valor;
    } else {
      continue;
    }
    porInsumo.set(f.insumoId, fila);
  }
  return [...porInsumo.entries()]
    .map(([insumoId, f]) => ({ insumoId, ...f }))
    .sort((a, b) => b.valorFaltante - a.valorFaltante);
}
