import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/cliente';
import {
  categorias,
  elementosPlano,
  estaciones,
  fotosProducto,
  gruposModificador,
  mediosPago,
  modificadores,
  motivosAutorizacion,
  reglasAutorizacion,
  pinesOperador,
  preciosProducto,
  productos,
  productosGrupos,
  sectores,
  usuarios,
} from '@/db/esquema';
import type { Catalogo, GrupoCatalogo } from '@/dominio/catalogo';
import { esRol, type Rol } from '@/dominio/roles';
import { esAccionAutorizable, type AccionAutorizable } from '@/dominio/autorizaciones';
import { sinArchivado } from './filas';

export async function leerCatalogo(): Promise<Catalogo> {
  const [filasOperadores, filasSectores, filasElementos, filasEstaciones, filasCategorias, filasProductos, filasGrupos, filasModificadores, filasRelaciones, filasMedios, filasMotivos, filasReglas] =
    await Promise.all([
      db
        .select({ id: usuarios.id, nombre: usuarios.nombre, rol: usuarios.rol, esSoporte: usuarios.esSoporte, pinHash: pinesOperador.hash })
        .from(usuarios)
        .leftJoin(pinesOperador, eq(pinesOperador.usuarioId, usuarios.id))
        .where(eq(usuarios.activo, true))
        .orderBy(asc(usuarios.nombre)),
      db.select().from(sectores).where(isNull(sectores.archivadoEn)).orderBy(asc(sectores.orden), asc(sectores.nombre)),
      db.select().from(elementosPlano).where(isNull(elementosPlano.archivadoEn)),
      db.select().from(estaciones).where(isNull(estaciones.archivadoEn)).orderBy(asc(estaciones.orden), asc(estaciones.nombre)),
      db.select().from(categorias).where(isNull(categorias.archivadoEn)).orderBy(asc(categorias.orden), asc(categorias.nombre)),
      db
        .select({ producto: productos, precio: preciosProducto, fotoVersion: fotosProducto.version })
        .from(productos)
        .innerJoin(preciosProducto, and(eq(preciosProducto.productoId, productos.id), isNull(preciosProducto.archivadoEn)))
        .leftJoin(fotosProducto, eq(fotosProducto.productoId, productos.id))
        .where(isNull(productos.archivadoEn))
        .orderBy(asc(productos.orden), asc(productos.nombre)),
      db.select().from(gruposModificador).where(isNull(gruposModificador.archivadoEn)).orderBy(asc(gruposModificador.nombre)),
      db.select().from(modificadores).where(isNull(modificadores.archivadoEn)).orderBy(asc(modificadores.orden), asc(modificadores.nombre)),
      db.select().from(productosGrupos).orderBy(asc(productosGrupos.orden)),
      db.select({ id: mediosPago.id, nombre: mediosPago.nombre, efectivo: mediosPago.efectivo }).from(mediosPago).where(isNull(mediosPago.archivadoEn)).orderBy(asc(mediosPago.orden)),
      db.select().from(motivosAutorizacion).where(isNull(motivosAutorizacion.archivadoEn)).orderBy(asc(motivosAutorizacion.orden)),
      db.select().from(reglasAutorizacion),
    ]);

  const grupos = new Map<string, GrupoCatalogo>(
    filasGrupos.map((g) => [g.id, { id: g.id, nombre: g.nombre, obligatorio: g.obligatorio, multiple: g.multiple, modificadores: [] }]),
  );
  for (const m of filasModificadores) grupos.get(m.grupoId)?.modificadores.push({ id: m.id, nombre: m.nombre, precioCentavos: m.precioCentavos });

  const gruposDe = new Map<string, string[]>();
  for (const r of filasRelaciones) if (grupos.has(r.grupoId)) gruposDe.set(r.productoId, [...(gruposDe.get(r.productoId) ?? []), r.grupoId]);

  return {
    // Soporte no opera el salón: no aparece para elegir como operador o mozo.
    operadores: filasOperadores
      .filter((o) => !o.esSoporte && esRol(o.rol))
      .map((o) => ({ id: o.id, nombre: o.nombre, rol: o.rol as Rol, pinHash: o.pinHash })),
    sectores: filasSectores.map(sinArchivado),
    elementos: filasElementos.map(sinArchivado),
    estaciones: filasEstaciones.map(sinArchivado),
    categorias: filasCategorias.map(sinArchivado),
    productos: filasProductos.map(({ producto, precio, fotoVersion }) => ({
      id: producto.id,
      nombre: producto.nombre,
      categoriaId: producto.categoriaId,
      estacionId: producto.estacionId,
      disponible: producto.disponible,
      precioId: precio.id,
      precioCentavos: precio.precioCentavos,
      grupoIds: gruposDe.get(producto.id) ?? [],
      fotoVersion,
    })),
    grupos: [...grupos.values()],
    medios: filasMedios,
    motivos: filasMotivos.filter((m) => esAccionAutorizable(m.accion)).map((m) => ({ id: m.id, accion: m.accion as AccionAutorizable, texto: m.texto })),
    reglas: Object.fromEntries(filasReglas.filter((r) => esAccionAutorizable(r.accion)).map((r) => [r.accion, r.roles.filter(esRol)])),
  };
}
