import 'server-only';
import { and, asc, eq, ilike, isNull } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { categorias, estaciones, fotosProducto, gruposModificador, modificadores, preciosProducto, productos, productosGrupos } from '@/db/esquema';
import { puede } from '@/dominio/permisos';
import { ErrorAcceso, ErrorDominio, type UsuarioSesion } from '@/lib/sesion';
import { auditar } from './auditoria';
import { validarFoto } from './fotos';

/**
 * La carta se administra con conexión y baja a los dispositivos con el
 * catálogo. Nada se borra: archivado, sigue existiendo para los eventos que
 * ya lo nombran.
 */

function exigirCarta(actor: UsuarioSesion) {
  if (!puede(actor, 'carta.administrar')) throw new ErrorAcceso(403, 'No tenés permiso para administrar la carta');
}

async function registrar(actor: UsuarioSesion, que: string, id: string, detalle: Record<string, unknown>, ip: string | null) {
  await auditar({ accion: 'carta.modificada', actor, objetivoTipo: 'carta', objetivoId: id, detalle: { que, ...detalle }, ip });
}

export async function listarCarta(actor: UsuarioSesion, filtro: { busqueda?: string; categoriaId?: string }) {
  exigirCarta(actor);
  const [filasCategorias, filasEstaciones, filasGrupos, filasModificadores, filasProductos, relaciones] = await Promise.all([
    db.select().from(categorias).where(isNull(categorias.archivadoEn)).orderBy(asc(categorias.orden), asc(categorias.nombre)),
    db.select().from(estaciones).where(isNull(estaciones.archivadoEn)).orderBy(asc(estaciones.orden), asc(estaciones.nombre)),
    db.select().from(gruposModificador).where(isNull(gruposModificador.archivadoEn)).orderBy(asc(gruposModificador.nombre)),
    db.select().from(modificadores).where(isNull(modificadores.archivadoEn)).orderBy(asc(modificadores.orden), asc(modificadores.nombre)),
    db
      .select({ producto: productos, precioCentavos: preciosProducto.precioCentavos, fotoVersion: fotosProducto.version })
      .from(productos)
      .innerJoin(preciosProducto, and(eq(preciosProducto.productoId, productos.id), isNull(preciosProducto.archivadoEn)))
      .leftJoin(fotosProducto, eq(fotosProducto.productoId, productos.id))
      .where(
        and(
          isNull(productos.archivadoEn),
          filtro.categoriaId ? eq(productos.categoriaId, filtro.categoriaId) : undefined,
          filtro.busqueda ? ilike(productos.nombre, `%${filtro.busqueda.replace(/[%_\\]/g, '\\$&')}%`) : undefined,
        ),
      )
      .orderBy(asc(productos.orden), asc(productos.nombre)),
    db.select().from(productosGrupos),
  ]);

  return {
    categorias: filasCategorias.map(({ id, nombre, orden }) => ({ id, nombre, orden })),
    estaciones: filasEstaciones.map(({ id, nombre, orden }) => ({ id, nombre, orden })),
    grupos: filasGrupos.map((g) => ({
      id: g.id,
      nombre: g.nombre,
      obligatorio: g.obligatorio,
      multiple: g.multiple,
      modificadores: filasModificadores.filter((m) => m.grupoId === g.id).map(({ id, nombre, precioCentavos }) => ({ id, nombre, precioCentavos })),
    })),
    productos: filasProductos.map(({ producto, precioCentavos, fotoVersion }) => ({
      id: producto.id,
      nombre: producto.nombre,
      categoriaId: producto.categoriaId,
      estacionId: producto.estacionId,
      disponible: producto.disponible,
      precioCentavos,
      grupoIds: relaciones.filter((r) => r.productoId === producto.id).map((r) => r.grupoId),
      fotoVersion,
    })),
  };
}

export type Carta = Awaited<ReturnType<typeof listarCarta>>;

export async function guardarEstacion(actor: UsuarioSesion, datos: { id: string | null; nombre: string }, ip: string | null) {
  exigirCarta(actor);
  if (datos.id) {
    await db.update(estaciones).set({ nombre: datos.nombre }).where(eq(estaciones.id, datos.id));
    await registrar(actor, 'estacion.renombrada', datos.id, { nombre: datos.nombre }, ip);
    return datos.id;
  }
  const [fila] = await db.insert(estaciones).values({ nombre: datos.nombre }).returning({ id: estaciones.id });
  await registrar(actor, 'estacion.creada', fila!.id, { nombre: datos.nombre }, ip);
  return fila!.id;
}

export async function archivarEstacion(actor: UsuarioSesion, id: string, ip: string | null) {
  exigirCarta(actor);
  const enUso = await db.query.productos.findFirst({ where: and(eq(productos.estacionId, id), isNull(productos.archivadoEn)) });
  if (enUso) throw new ErrorDominio('Hay productos que se preparan en esta estación: pasalos a otra primero');
  await db.update(estaciones).set({ archivadoEn: new Date() }).where(eq(estaciones.id, id));
  await registrar(actor, 'estacion.archivada', id, {}, ip);
}

export async function guardarCategoria(actor: UsuarioSesion, datos: { id: string | null; nombre: string }, ip: string | null) {
  exigirCarta(actor);
  if (datos.id) {
    await db.update(categorias).set({ nombre: datos.nombre }).where(eq(categorias.id, datos.id));
    await registrar(actor, 'categoria.renombrada', datos.id, { nombre: datos.nombre }, ip);
    return datos.id;
  }
  const [fila] = await db.insert(categorias).values({ nombre: datos.nombre }).returning({ id: categorias.id });
  await registrar(actor, 'categoria.creada', fila!.id, { nombre: datos.nombre }, ip);
  return fila!.id;
}

export async function archivarCategoria(actor: UsuarioSesion, id: string, ip: string | null) {
  exigirCarta(actor);
  const enUso = await db.query.productos.findFirst({ where: and(eq(productos.categoriaId, id), isNull(productos.archivadoEn)) });
  if (enUso) throw new ErrorDominio('La categoría tiene productos: pasalos a otra o archivalos primero');
  await db.update(categorias).set({ archivadoEn: new Date() }).where(eq(categorias.id, id));
  await registrar(actor, 'categoria.archivada', id, {}, ip);
}

export interface DatosProducto {
  id: string | null;
  nombre: string;
  categoriaId: string;
  estacionId: string;
  precioCentavos: number;
  disponible: boolean;
  grupoIds: string[];
}

export async function guardarProducto(actor: UsuarioSesion, datos: DatosProducto, ip: string | null) {
  exigirCarta(actor);
  return db.transaction(async (tx) => {
    let id = datos.id;
    if (id) {
      await tx
        .update(productos)
        .set({ nombre: datos.nombre, categoriaId: datos.categoriaId, estacionId: datos.estacionId, disponible: datos.disponible })
        .where(eq(productos.id, id));
    } else {
      const [fila] = await tx
        .insert(productos)
        .values({ nombre: datos.nombre, categoriaId: datos.categoriaId, estacionId: datos.estacionId, disponible: datos.disponible })
        .returning({ id: productos.id });
      id = fila!.id;
    }

    // El precio no se edita: si cambió, se archiva el vigente y se crea otro.
    const vigente = await tx.query.preciosProducto.findFirst({
      where: and(eq(preciosProducto.productoId, id), isNull(preciosProducto.archivadoEn)),
    });
    if (!vigente || vigente.precioCentavos !== datos.precioCentavos) {
      if (vigente) await tx.update(preciosProducto).set({ archivadoEn: new Date() }).where(eq(preciosProducto.id, vigente.id));
      await tx.insert(preciosProducto).values({ productoId: id, precioCentavos: datos.precioCentavos, creadoPorId: actor.id });
    }

    await tx.delete(productosGrupos).where(eq(productosGrupos.productoId, id));
    if (datos.grupoIds.length) {
      await tx.insert(productosGrupos).values(datos.grupoIds.map((grupoId, orden) => ({ productoId: id, grupoId, orden })));
    }

    await auditar({
      accion: 'carta.modificada',
      actor,
      objetivoTipo: 'carta',
      objetivoId: id,
      detalle: {
        que: datos.id ? 'producto.editado' : 'producto.creado',
        nombre: datos.nombre,
        precioAnterior: vigente?.precioCentavos ?? null,
        precioNuevo: datos.precioCentavos,
      },
      ip,
    });
    return id;
  });
}

export async function archivarProducto(actor: UsuarioSesion, id: string, ip: string | null) {
  exigirCarta(actor);
  await db.update(productos).set({ archivadoEn: new Date() }).where(eq(productos.id, id));
  await registrar(actor, 'producto.archivado', id, {}, ip);
}

export async function cambiarDisponibilidad(actor: UsuarioSesion, id: string, disponible: boolean, ip: string | null) {
  exigirCarta(actor);
  await db.update(productos).set({ disponible }).where(eq(productos.id, id));
  await registrar(actor, disponible ? 'producto.disponible' : 'producto.agotado', id, {}, ip);
}

export interface DatosGrupo {
  id: string | null;
  nombre: string;
  obligatorio: boolean;
  multiple: boolean;
  /** Las opciones como quedan. Una sin `id` es nueva; una que falta, se archiva. */
  opciones: { id: string | null; nombre: string; precioCentavos: number }[];
}

export async function guardarGrupo(actor: UsuarioSesion, datos: DatosGrupo, ip: string | null) {
  exigirCarta(actor);
  return db.transaction(async (tx) => {
    let id = datos.id;
    if (id) {
      await tx.update(gruposModificador).set({ nombre: datos.nombre, obligatorio: datos.obligatorio, multiple: datos.multiple }).where(eq(gruposModificador.id, id));
    } else {
      const [fila] = await tx
        .insert(gruposModificador)
        .values({ nombre: datos.nombre, obligatorio: datos.obligatorio, multiple: datos.multiple })
        .returning({ id: gruposModificador.id });
      id = fila!.id;
    }

    const actuales = await tx.select().from(modificadores).where(and(eq(modificadores.grupoId, id), isNull(modificadores.archivadoEn)));
    const ahora = new Date();
    for (const actual of actuales) {
      const pedida = datos.opciones.find((o) => o.id === actual.id);
      // Cambiar el precio de una opción es archivarla y crear otra, igual que un producto.
      if (!pedida || pedida.precioCentavos !== actual.precioCentavos) {
        await tx.update(modificadores).set({ archivadoEn: ahora }).where(eq(modificadores.id, actual.id));
      } else if (pedida.nombre !== actual.nombre) {
        await tx.update(modificadores).set({ nombre: pedida.nombre }).where(eq(modificadores.id, actual.id));
      }
    }
    const nuevas = datos.opciones.filter((o) => {
      const actual = actuales.find((a) => a.id === o.id);
      return !actual || actual.precioCentavos !== o.precioCentavos;
    });
    if (nuevas.length) {
      await tx.insert(modificadores).values(
        nuevas.map((o) => ({ grupoId: id, nombre: o.nombre, precioCentavos: o.precioCentavos, orden: datos.opciones.indexOf(o) })),
      );
    }

    await auditar({
      accion: 'carta.modificada',
      actor,
      objetivoTipo: 'carta',
      objetivoId: id,
      detalle: { que: datos.id ? 'grupo.editado' : 'grupo.creado', nombre: datos.nombre, opciones: datos.opciones },
      ip,
    });
    return id;
  });
}

export async function archivarGrupo(actor: UsuarioSesion, id: string, ip: string | null) {
  exigirCarta(actor);
  await db.transaction(async (tx) => {
    await tx.update(gruposModificador).set({ archivadoEn: new Date() }).where(eq(gruposModificador.id, id));
    await tx.delete(productosGrupos).where(eq(productosGrupos.grupoId, id));
  });
  await registrar(actor, 'grupo.archivado', id, {}, ip);
}

export async function guardarFotoProducto(actor: UsuarioSesion, productoId: string, imagen: Buffer, ip: string | null) {
  exigirCarta(actor);
  const tipo = validarFoto(imagen);
  const [producto] = await db.select({ id: productos.id }).from(productos).where(and(eq(productos.id, productoId), isNull(productos.archivadoEn)));
  if (!producto) throw new ErrorDominio('El producto no existe');
  const version = crypto.randomUUID();
  await db
    .insert(fotosProducto)
    .values({ productoId, imagen, tipo, version })
    .onConflictDoUpdate({ target: fotosProducto.productoId, set: { imagen, tipo, version, subidaEn: new Date() } });
  await registrar(actor, 'foto.subida', productoId, { bytes: imagen.length }, ip);
  return version;
}

export async function quitarFotoProducto(actor: UsuarioSesion, productoId: string, ip: string | null) {
  exigirCarta(actor);
  await db.delete(fotosProducto).where(eq(fotosProducto.productoId, productoId));
  await registrar(actor, 'foto.quitada', productoId, {}, ip);
}

/** Para servirla: cualquiera con sesión, porque la carta la ven todos los que cargan pedidos. */
export async function leerFotoProducto(productoId: string) {
  const [foto] = await db.select({ imagen: fotosProducto.imagen, tipo: fotosProducto.tipo, version: fotosProducto.version }).from(fotosProducto).where(eq(fotosProducto.productoId, productoId));
  return foto ?? null;
}
