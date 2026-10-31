import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { categorias, estaciones, usuarios } from '@/db/esquema';
import type { UsuarioSesion } from '@/lib/sesion';
import { guardarProductoConReceta, guardarProductoConStock, leerProductos } from './productos';
import { leerRecetas } from './stock';

const sufijo = crypto.randomUUID().slice(0, 6);
let actor: UsuarioSesion;
let categoriaId: string;
let estacionId: string;

beforeAll(async () => {
  const [dueno] = await db.select().from(usuarios).where(and(eq(usuarios.rol, 'dueno'), eq(usuarios.esSoporte, false))).limit(1);
  const fila = dueno ?? (await db.insert(usuarios).values({ id: crypto.randomUUID(), nombre: 'Dueño de prueba', email: `dueno-${sufijo}@ejemplo.com`, rol: 'dueno' }).returning())[0]!;
  actor = { id: fila.id, nombre: fila.nombre, email: fila.email, foto: null, rol: 'dueno', esSoporte: false };
  categoriaId = (await db.insert(categorias).values({ nombre: `Bebidas ${sufijo}` }).returning())[0]!.id;
  estacionId = (await db.insert(estaciones).values({ nombre: `Barra ${sufijo}` }).returning())[0]!.id;
});

describe('productos', () => {
  it('uno con stock vendible se vende descontando una unidad de su composición', async () => {
    const venta = { vendible: true, precioCentavos: 900_000, categoriaId, estacionId };
    const insumoId = await guardarProductoConStock(
      actor,
      { insumo: { id: null, nombre: `Vino ${sufijo}`, tipo: 'compra', unidad: 'ml', contenidoPorUnidad: 750, stockMinimo: 0, presentaciones: [] }, venta },
      null,
    );
    const producto = (await leerProductos(actor)).conStock.find((p) => p.id === insumoId)!;
    expect(producto.venta).toMatchObject({ vendible: true, precioCentavos: 900_000, categoriaId, estacionId });
    const receta = (await leerRecetas(actor)).productos.find((p) => p.id === producto.venta!.productoId)!;
    expect(receta.lineas).toEqual([{ insumoId, cantidad: 750, mermaPorcentaje: 0 }]);

    // Dejar de venderlo lo saca de la carta sin borrar nada.
    await guardarProductoConStock(
      actor,
      { insumo: { id: insumoId, nombre: `Vino ${sufijo}`, tipo: 'compra', unidad: 'ml', contenidoPorUnidad: 750, stockMinimo: 0, presentaciones: [] }, venta: { ...venta, vendible: false } },
      null,
    );
    expect((await leerProductos(actor)).conStock.find((p) => p.id === insumoId)!.venta!.vendible).toBe(false);
  });

  it('uno con receta descuenta de los productos con stock que lleva', async () => {
    const insumoId = await guardarProductoConStock(
      actor,
      {
        insumo: { id: null, nombre: `Fernet ${sufijo}`, tipo: 'compra', unidad: 'ml', contenidoPorUnidad: 750, stockMinimo: 0, presentaciones: [] },
        venta: { vendible: false, precioCentavos: 0, categoriaId: null, estacionId: null },
      },
      null,
    );
    const id = await guardarProductoConReceta(
      actor,
      { id: null, nombre: `Fernet con cola ${sufijo}`, venta: { vendible: true, precioCentavos: 500_000, categoriaId, estacionId }, lineas: [{ insumoId, cantidad: 70 }] },
      null,
    );
    const producto = (await leerProductos(actor)).conReceta.find((p) => p.id === id)!;
    expect(producto).toMatchObject({ vendible: true, precioCentavos: 500_000 });
    expect(producto.lineas).toEqual([{ insumoId, cantidad: 70, mermaPorcentaje: 0 }]);
    // Sin vender no tiene versión en la carta.
    expect((await leerProductos(actor)).conStock.find((p) => p.id === insumoId)!.venta).toBeNull();
  });
});
