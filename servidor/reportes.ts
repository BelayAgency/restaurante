import 'server-only';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { categorias, compras, insumos, lineasReceta, movimientosStock, productos, proveedores, recetas, usuarios } from '@/db/esquema';
import { puede } from '@/dominio/permisos';
import { importeItem, reducirSalon } from '@/dominio/reductores/salon';
import { costoPorcion, type UnidadBase } from '@/dominio/stock';
import { ErrorAcceso, type UsuarioSesion } from '@/lib/sesion';
import { eventosDelPeriodo } from './control';

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const HORA = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false });
const DIA_SEMANA = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short' });
const ORDEN_SEMANA = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const NOMBRES_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Costo teórico de una porción de cada producto con su receta vigente y el costo promedio de hoy. */
async function costosDeProductos(): Promise<Map<string, number>> {
  const [filasRecetas, filasLineas, filasInsumos] = await Promise.all([
    db.select().from(recetas).where(and(isNull(recetas.archivadoEn), sql`${recetas.productoId} is not null`)),
    db.select().from(lineasReceta),
    db.select({ id: insumos.id, costo: insumos.costoUnitario }).from(insumos),
  ]);
  const costo = new Map(filasInsumos.map((i) => [i.id, i.costo]));
  return new Map(
    filasRecetas.map((r) => [
      r.productoId!,
      costoPorcion(
        filasLineas.filter((l) => l.recetaId === r.id).map((l) => ({ insumoId: l.insumoId, cantidad: l.cantidad, mermaPorcentaje: l.mermaPorcentaje })),
        r.rendimiento,
        (id) => costo.get(id) ?? 0,
      ),
    ]),
  );
}

/**
 * Las ventas de un período, contadas sobre las cuentas que se cerraron en él.
 * Las ventas en plata son lo cobrado (después de descuentos); lo de cada plato
 * es lo cargado, antes de descuentos generales de la cuenta.
 */
export async function reporteDeVentas(actor: UsuarioSesion, desde: string, hasta: string) {
  if (!puede(actor, 'reportes.ver')) throw new ErrorAcceso(403, 'No tenés permiso');
  const { todos, inicio, fin } = await eventosDelPeriodo(desde, hasta);
  const cuentas = [...reducirSalon(todos).cuentas.values()].filter((c) => c.estado === 'cerrada' && c.cerradaEn && new Date(c.cerradaEn) >= inicio && new Date(c.cerradaEn) <= fin);

  const [filasProductos, filasCategorias, filasUsuarios, costos] = await Promise.all([
    db.select({ id: productos.id, nombre: productos.nombre, categoriaId: productos.categoriaId }).from(productos),
    db.select({ id: categorias.id, nombre: categorias.nombre }).from(categorias),
    db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios),
    costosDeProductos(),
  ]);
  const producto = new Map(filasProductos.map((p) => [p.id, p]));
  const categoria = new Map(filasCategorias.map((c) => [c.id, c.nombre]));
  const persona = new Map(filasUsuarios.map((u) => [u.id, u.nombre]));

  const porDia = new Map<string, number>();
  const porHora = Array.from({ length: 24 }, () => 0);
  const porSemana = Array.from({ length: 7 }, () => 0);
  const porMozo = new Map<string, { ventasCentavos: number; cuentas: number; comensales: number }>();
  const porPlato = new Map<string, { cantidad: number; ventasCentavos: number }>();

  for (const c of cuentas) {
    const momento = new Date(c.cerradaEn!);
    porDia.set(DIA.format(momento), (porDia.get(DIA.format(momento)) ?? 0) + c.pagadoCentavos);
    porHora[Number(HORA.format(momento)) % 24]! += c.pagadoCentavos;
    porSemana[ORDEN_SEMANA.indexOf(DIA_SEMANA.format(momento))]! += c.pagadoCentavos;
    const mozo = porMozo.get(c.mozoId) ?? { ventasCentavos: 0, cuentas: 0, comensales: 0 };
    mozo.ventasCentavos += c.pagadoCentavos;
    mozo.cuentas += 1;
    mozo.comensales += c.comensales;
    porMozo.set(c.mozoId, mozo);
    for (const item of c.items.values()) {
      if (item.anulado || item.cortesia) continue;
      const plato = porPlato.get(item.productoId) ?? { cantidad: 0, ventasCentavos: 0 };
      plato.cantidad += item.cantidad;
      plato.ventasCentavos += importeItem(item);
      porPlato.set(item.productoId, plato);
    }
  }

  const platos = [...porPlato.entries()]
    .map(([id, p]) => {
      const costoUnitario = costos.get(id);
      const costoCentavos = costoUnitario === undefined ? null : Math.round(costoUnitario * p.cantidad);
      return {
        id,
        nombre: producto.get(id)?.nombre ?? '—',
        categoria: categoria.get(producto.get(id)?.categoriaId ?? '') ?? '—',
        cantidad: p.cantidad,
        ventasCentavos: p.ventasCentavos,
        costoCentavos,
        margenCentavos: costoCentavos === null ? null : p.ventasCentavos - costoCentavos,
      };
    })
    .sort((a, b) => b.ventasCentavos - a.ventasCentavos);

  const porCategoria = new Map<string, { cantidad: number; ventasCentavos: number }>();
  for (const p of platos) {
    const fila = porCategoria.get(p.categoria) ?? { cantidad: 0, ventasCentavos: 0 };
    fila.cantidad += p.cantidad;
    fila.ventasCentavos += p.ventasCentavos;
    porCategoria.set(p.categoria, fila);
  }

  const ventasCentavos = cuentas.reduce((s, c) => s + c.pagadoCentavos, 0);
  const comensales = cuentas.reduce((s, c) => s + c.comensales, 0);
  const propinasCentavos = cuentas.reduce((s, c) => s + c.cobros.reduce((t, x) => t + x.propinaCentavos, 0), 0);

  return {
    resumen: {
      ventasCentavos,
      propinasCentavos,
      cuentas: cuentas.length,
      comensales,
      ticketPromedioCentavos: cuentas.length ? Math.round(ventasCentavos / cuentas.length) : 0,
      porComensalCentavos: comensales ? Math.round(ventasCentavos / comensales) : 0,
    },
    porDia: [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, centavos]) => ({ dia, ventasCentavos: centavos })),
    porHora,
    porSemana: porSemana.map((ventas, i) => ({ dia: NOMBRES_SEMANA[i]!, ventasCentavos: ventas })),
    porMozo: [...porMozo.entries()]
      .map(([id, m]) => ({ nombre: persona.get(id) ?? '—', ...m, porComensalCentavos: m.comensales ? Math.round(m.ventasCentavos / m.comensales) : 0 }))
      .sort((a, b) => b.ventasCentavos - a.ventasCentavos),
    platos,
    // Más y menos rentables: sólo los que tienen receta, por margen total.
    rentabilidad: platos.filter((p) => p.margenCentavos !== null).sort((a, b) => b.margenCentavos! - a.margenCentavos!),
    porCategoria: [...porCategoria.entries()].map(([nombre, c]) => ({ nombre, ...c })).sort((a, b) => b.ventasCentavos - a.ventasCentavos),
  };
}

export type ReporteVentas = Awaited<ReturnType<typeof reporteDeVentas>>;

export async function reporteDeCompras(actor: UsuarioSesion, desde: string, hasta: string) {
  if (!puede(actor, 'reportes.ver')) throw new ErrorAcceso(403, 'No tenés permiso');
  const filas = await db
    .select({ proveedor: proveedores.nombre, totalCentavos: sql<string>`sum(${compras.totalCentavos})`, facturas: sql<string>`count(*)` })
    .from(compras)
    .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
    .where(and(gte(compras.fecha, desde), lte(compras.fecha, hasta)))
    .groupBy(proveedores.nombre);
  return filas.map((f) => ({ proveedor: f.proveedor, totalCentavos: Number(f.totalCentavos), facturas: Number(f.facturas) })).sort((a, b) => b.totalCentavos - a.totalCentavos);
}

/** Lo que hay hoy en los depósitos, a costo promedio. */
export async function valorizacionDeStock(actor: UsuarioSesion) {
  if (!puede(actor, 'reportes.ver')) throw new ErrorAcceso(403, 'No tenés permiso');
  const filas = await db
    .select({ id: insumos.id, nombre: insumos.nombre, unidad: insumos.unidad, costo: insumos.costoUnitario, cantidad: sql<string>`coalesce(sum(${movimientosStock.cantidad}), 0)` })
    .from(insumos)
    .leftJoin(movimientosStock, eq(movimientosStock.insumoId, insumos.id))
    .where(isNull(insumos.archivadoEn))
    .groupBy(insumos.id);
  return filas
    .map((f) => ({ nombre: f.nombre, unidad: f.unidad as UnidadBase, cantidad: Number(f.cantidad), valorCentavos: Math.round(Math.max(0, Number(f.cantidad)) * f.costo) }))
    .sort((a, b) => b.valorCentavos - a.valorCentavos);
}
