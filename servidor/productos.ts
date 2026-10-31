import 'server-only';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { categorias, estaciones, fotosProducto, insumos, lineasReceta, preciosProducto, productos, recetas } from '@/db/esquema';
import { puede } from '@/dominio/permisos';
import { ErrorAcceso, ErrorDominio, type UsuarioSesion } from '@/lib/sesion';
import { auditar } from './auditoria';
import { archivarInsumo, guardarInsumo, guardarReceta, leerRecetas, leerStock, type DatosInsumo } from './stock';

/**
 * Productos, como los ve quien los administra: los que tienen stock (un
 * insumo, que además puede venderse) y los que se venden con una receta que
 * descuenta de los primeros. Por debajo siguen siendo insumos y productos de
 * la carta; esto los junta en un solo lugar.
 */

function exigir(actor: UsuarioSesion, venta: boolean) {
  if (!puede(actor, 'stock.administrar')) throw new ErrorAcceso(403, 'No tenés permiso para esto');
  if (venta && !puede(actor, 'carta.administrar')) throw new ErrorAcceso(403, 'No tenés permiso para cambiar lo que se vende');
}

export interface Venta {
  vendible: boolean;
  precioCentavos: number;
  /** Sin vender no hacen falta: se conservan los que tenía, o los primeros, para que el producto exista igual. */
  categoriaId: string | null;
  estacionId: string | null;
}

export async function leerProductos(actor: UsuarioSesion) {
  exigir(actor, false);
  const [stock, recetasDe, filasCarta, filasCategorias, filasEstaciones] = await Promise.all([
    leerStock(actor),
    leerRecetas(actor),
    db
      .select({ producto: productos, precio: preciosProducto, fotoVersion: fotosProducto.version })
      .from(productos)
      .innerJoin(preciosProducto, and(eq(preciosProducto.productoId, productos.id), isNull(preciosProducto.archivadoEn)))
      .leftJoin(fotosProducto, eq(fotosProducto.productoId, productos.id))
      .where(isNull(productos.archivadoEn))
      .orderBy(asc(productos.nombre)),
    db.select({ id: categorias.id, nombre: categorias.nombre }).from(categorias).where(isNull(categorias.archivadoEn)).orderBy(asc(categorias.orden)),
    db.select({ id: estaciones.id, nombre: estaciones.nombre }).from(estaciones).where(isNull(estaciones.archivadoEn)),
  ]);
  const venta = (f: (typeof filasCarta)[number]) => ({
    productoId: f.producto.id,
    vendible: f.producto.disponible,
    precioCentavos: f.precio.precioCentavos,
    categoriaId: f.producto.categoriaId,
    estacionId: f.producto.estacionId,
  });

  return {
    conStock: stock.insumos.map((i) => {
      const vinculado = filasCarta.find((f) => f.producto.insumoId === i.id);
      return { ...i, venta: vinculado ? venta(vinculado) : null };
    }),
    conReceta: filasCarta
      .filter((f) => !f.producto.insumoId)
      .map((f) => {
        const receta = recetasDe.productos.find((p) => p.id === f.producto.id);
        return {
          id: f.producto.id,
          nombre: f.producto.nombre,
          fotoVersion: f.fotoVersion,
          ...venta(f),
          lineas: receta?.lineas ?? [],
          costoCentavos: receta?.costoCentavos ?? null,
          foodCost: receta?.foodCost ?? null,
        };
      }),
    categorias: filasCategorias,
    estaciones: filasEstaciones,
  };
}

export type Productos = Awaited<ReturnType<typeof leerProductos>>;

async function guardarPrecio(productoId: string, precioCentavos: number, actorId: string) {
  // El precio no se edita: si cambió, se archiva el vigente y se crea otro.
  const [vigente] = await db.select().from(preciosProducto).where(and(eq(preciosProducto.productoId, productoId), isNull(preciosProducto.archivadoEn)));
  if (vigente?.precioCentavos === precioCentavos) return;
  if (vigente) await db.update(preciosProducto).set({ archivadoEn: new Date() }).where(eq(preciosProducto.id, vigente.id));
  await db.insert(preciosProducto).values({ productoId, precioCentavos, creadoPorId: actorId });
}

/** Lo que pide la carta para existir, aunque no se venda: lo pedido, lo que ya tenía o lo primero que haya. */
async function ubicacion(venta: Venta, actual?: { categoriaId: string; estacionId: string }) {
  const [categoria] = await db.select({ id: categorias.id }).from(categorias).where(isNull(categorias.archivadoEn)).orderBy(asc(categorias.orden)).limit(1);
  const [estacion] = await db.select({ id: estaciones.id }).from(estaciones).where(isNull(estaciones.archivadoEn)).limit(1);
  const categoriaId = venta.categoriaId ?? actual?.categoriaId ?? categoria?.id;
  const estacionId = venta.estacionId ?? actual?.estacionId ?? estacion?.id;
  if (!categoriaId || !estacionId) throw new ErrorDominio('Cargá al menos una categoría y una estación de cocina');
  return { categoriaId, estacionId };
}

/** La receta vigente, sólo si cambió: guardarla otra vez crea una versión nueva. */
async function guardarRecetaSiCambio(actor: UsuarioSesion, productoId: string, lineas: { insumoId: string; cantidad: number }[], ip: string | null) {
  const vigente = (await leerRecetas(actor)).productos.find((p) => p.id === productoId)?.lineas ?? [];
  const igual = vigente.length === lineas.length && lineas.every((l) => vigente.some((v) => v.insumoId === l.insumoId && v.cantidad === l.cantidad && v.mermaPorcentaje === 0));
  if (igual) return;
  await guardarReceta(actor, { productoId, preparacionId: null, rendimiento: 1, lineas: lineas.map((l) => ({ ...l, mermaPorcentaje: 0 })) }, ip);
}

export async function guardarProductoConStock(actor: UsuarioSesion, datos: { insumo: DatosInsumo; venta: Venta }, ip: string | null) {
  const [vinculado] = datos.insumo.id
    ? await db.select().from(productos).where(and(eq(productos.insumoId, datos.insumo.id), isNull(productos.archivadoEn)))
    : [];
  exigir(actor, datos.venta.vendible || Boolean(vinculado));
  const insumoId = await guardarInsumo(actor, datos.insumo, ip);
  if (!datos.venta.vendible && !vinculado) return insumoId;

  const { categoriaId, estacionId } = await ubicacion(datos.venta, vinculado);
  let productoId = vinculado?.id;
  if (productoId) {
    await db.update(productos).set({ nombre: datos.insumo.nombre, categoriaId, estacionId, disponible: datos.venta.vendible }).where(eq(productos.id, productoId));
  } else {
    const [fila] = await db.insert(productos).values({ nombre: datos.insumo.nombre, categoriaId, estacionId, insumoId, disponible: true }).returning({ id: productos.id });
    productoId = fila!.id;
  }
  if (datos.venta.vendible) await guardarPrecio(productoId, datos.venta.precioCentavos, actor.id);
  else if (!vinculado) await guardarPrecio(productoId, 0, actor.id);

  // Vender uno descuenta una unidad: lo que diga la composición (una botella son 750 ml), o 1.
  const [insumo] = await db.select({ contenido: insumos.contenidoPorUnidad }).from(insumos).where(eq(insumos.id, insumoId));
  await guardarRecetaSiCambio(actor, productoId, [{ insumoId, cantidad: insumo?.contenido ?? 1 }], ip);
  await auditar({
    accion: 'carta.modificada',
    actor,
    objetivoTipo: 'carta',
    objetivoId: productoId,
    detalle: { que: datos.venta.vendible ? 'producto.vendible' : 'producto.no_vendible', insumoId, precio: datos.venta.vendible ? datos.venta.precioCentavos : null },
    ip,
  });
  return insumoId;
}

export async function guardarProductoConReceta(
  actor: UsuarioSesion,
  datos: { id: string | null; nombre: string; venta: Venta; lineas: { insumoId: string; cantidad: number }[] },
  ip: string | null,
) {
  exigir(actor, true);
  const [actual] = datos.id ? await db.select().from(productos).where(eq(productos.id, datos.id)) : [];
  if (datos.id && !actual) throw new ErrorDominio('El producto no existe');
  const { categoriaId, estacionId } = await ubicacion(datos.venta, actual);
  let id = actual?.id;
  if (id) {
    await db.update(productos).set({ nombre: datos.nombre, categoriaId, estacionId, disponible: datos.venta.vendible }).where(eq(productos.id, id));
  } else {
    const [fila] = await db.insert(productos).values({ nombre: datos.nombre, categoriaId, estacionId, disponible: datos.venta.vendible }).returning({ id: productos.id });
    id = fila!.id;
  }
  // La carta necesita un precio vigente para listarlo: sin vender, el que tenía o cero.
  if (datos.venta.vendible) await guardarPrecio(id, datos.venta.precioCentavos, actor.id);
  else if (!actual) await guardarPrecio(id, 0, actor.id);
  await guardarRecetaSiCambio(actor, id, datos.lineas, ip);
  await auditar({
    accion: 'carta.modificada',
    actor,
    objetivoTipo: 'carta',
    objetivoId: id,
    detalle: { que: actual ? 'producto.editado' : 'producto.creado', nombre: datos.nombre, precio: datos.venta.vendible ? datos.venta.precioCentavos : null },
    ip,
  });
  return id;
}

/**
 * Archivar un producto con stock archiva también su versión de la carta. Su
 * propia receta de venta no cuenta como «usado en una receta»: las de otros sí.
 */
export async function archivarProductoConStock(actor: UsuarioSesion, insumoId: string, ip: string | null) {
  exigir(actor, false);
  const [vinculado] = await db.select({ id: productos.id }).from(productos).where(and(eq(productos.insumoId, insumoId), isNull(productos.archivadoEn)));
  const enOtras = await db
    .select({ id: recetas.id })
    .from(lineasReceta)
    .innerJoin(recetas, eq(recetas.id, lineasReceta.recetaId))
    .where(and(eq(lineasReceta.insumoId, insumoId), isNull(recetas.archivadoEn), vinculado ? ne(recetas.productoId, vinculado.id) : undefined))
    .limit(1);
  if (enOtras.length) throw new ErrorDominio('Está en la receta de otro producto: sacalo de esa receta primero');
  if (vinculado) {
    await db.update(recetas).set({ archivadoEn: new Date() }).where(and(eq(recetas.productoId, vinculado.id), isNull(recetas.archivadoEn)));
    await db.update(productos).set({ archivadoEn: new Date() }).where(eq(productos.id, vinculado.id));
  }
  await archivarInsumo(actor, insumoId, ip);
}

export async function archivarProductoConReceta(actor: UsuarioSesion, productoId: string, ip: string | null) {
  exigir(actor, true);
  await db.update(productos).set({ archivadoEn: new Date() }).where(eq(productos.id, productoId));
  await db.update(recetas).set({ archivadoEn: new Date() }).where(and(eq(recetas.productoId, productoId), isNull(recetas.archivadoEn)));
  await auditar({ accion: 'carta.modificada', actor, objetivoTipo: 'carta', objetivoId: productoId, detalle: { que: 'producto.archivado' }, ip });
}
