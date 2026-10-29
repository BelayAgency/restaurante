import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { categorias, depositos, dispositivos, estaciones, eventos, movimientosStock, preciosProducto, productos, usuarios } from '@/db/esquema';
import type { EventoNuevo } from '@/dominio/eventos';
import type { UsuarioSesion } from '@/lib/sesion';
import {
  abrirConteo,
  cargarConteo,
  cerrarConteo,
  diferenciasDeStock,
  guardarInsumo,
  guardarProveedor,
  guardarReceta,
  leerConteo,
  leerStock,
  registrarCompra,
  registrarConsumoTeorico,
} from './stock';

const sufijo = crypto.randomUUID().slice(0, 6);
let actor: UsuarioSesion;
let insumoId: string;
let depositoId: string;
let productoId: string;
let dispositivoId: string;

function hoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

beforeAll(async () => {
  const [dueno] = await db.select().from(usuarios).where(and(eq(usuarios.rol, 'dueno'), eq(usuarios.esSoporte, false))).limit(1);
  const fila = dueno ?? (await db.insert(usuarios).values({ id: crypto.randomUUID(), nombre: 'Dueño de prueba', email: `dueno-${sufijo}@ejemplo.com`, rol: 'dueno' }).returning())[0]!;
  actor = { id: fila.id, nombre: fila.nombre, email: fila.email, foto: null, rol: 'dueno', esSoporte: false };

  const [deVenta] = await db.select().from(depositos).where(eq(depositos.deVenta, true)).limit(1);
  depositoId = deVenta!.id;

  const [estacion] = await db.insert(estaciones).values({ nombre: `Parrilla ${sufijo}` }).returning();
  const [categoria] = await db.insert(categorias).values({ nombre: `Carnes ${sufijo}` }).returning();
  const [producto] = await db.insert(productos).values({ nombre: `Bife ${sufijo}`, categoriaId: categoria!.id, estacionId: estacion!.id }).returning();
  await db.insert(preciosProducto).values({ productoId: producto!.id, precioCentavos: 2_000_000 });
  productoId = producto!.id;

  dispositivoId = crypto.randomUUID();
  await db.insert(dispositivos).values({ id: dispositivoId, nombre: `Prueba ${sufijo}` });
});

describe('stock de punta a punta', () => {
  it('dos compras dejan el costo promedio ponderado', async () => {
    insumoId = await guardarInsumo(
      actor,
      { id: null, nombre: `Bife ancho ${sufijo}`, tipo: 'compra', unidad: 'g', stockMinimo: 0, presentaciones: [{ id: null, nombre: 'Caja 10 kg', cantidadBase: 10_000 }] },
      null,
    );
    const proveedorId = await guardarProveedor(actor, { id: null, nombre: `Frigorífico ${sufijo}`, cuit: null }, null);
    const stock = await leerStock(actor);
    const caja = stock.insumos.find((i) => i.id === insumoId)!.presentaciones[0]!;

    await registrarCompra(actor, { proveedorId, depositoId, numeroFactura: `A-${sufijo}-1`, fecha: hoy(), lineas: [{ insumoId, presentacionId: caja.id, cantidadPresentaciones: 1, costoCentavos: 15_000_000 }] }, null);
    await registrarCompra(actor, { proveedorId, depositoId, numeroFactura: `A-${sufijo}-2`, fecha: hoy(), lineas: [{ insumoId, presentacionId: null, cantidadPresentaciones: 10_000, costoCentavos: 25_000_000 }] }, null);

    const despues = (await leerStock(actor)).insumos.find((i) => i.id === insumoId)!;
    expect(despues.total).toBeCloseTo(20_000);
    // 10 kg a 1.500 c/g y 10 kg a 2.500 c/g: 2.000 c/g en promedio.
    expect(despues.costoUnitario).toBeCloseTo(2_000);
  });

  it('enviar a cocina descuenta según la receta, una sola vez', async () => {
    await guardarReceta(actor, { productoId, preparacionId: null, rendimiento: 1, lineas: [{ insumoId, cantidad: 300, mermaPorcentaje: 10 }] }, null);

    const itemId = crypto.randomUUID();
    const base = {
      version: 1 as const,
      dispositivoId,
      operadorId: actor.id,
      autorizadoPorId: null,
      motivoId: null,
      motivoTexto: null,
      creadoEnDispositivo: new Date().toISOString(),
      agregadoId: crypto.randomUUID(),
    };
    const carga = {
      ...base,
      id: crypto.randomUUID(),
      tipo: 'item_agregado' as const,
      datos: { itemId, productoId, precioId: crypto.randomUUID(), nombre: 'Bife', precioCentavos: 2_000_000, estacionId: crypto.randomUUID(), cantidad: 2, modificadores: [], nota: null },
    };
    await db.insert(eventos).values({
      id: carga.id,
      tipo: carga.tipo,
      version: 1,
      agregadoTipo: 'cuenta',
      agregadoId: carga.agregadoId,
      datos: carga.datos,
      operadorId: actor.id,
      dispositivoId,
      sesionUsuarioId: actor.id,
      creadoEnDispositivo: new Date(),
      resultado: 'aceptado',
    });
    const envio = { ...base, id: crypto.randomUUID(), tipo: 'items_enviados' as const, datos: { envioId: crypto.randomUUID(), itemIds: [itemId] } } satisfies EventoNuevo;

    await registrarConsumoTeorico(envio);
    await registrarConsumoTeorico(envio);

    const [consumo] = await db
      .select({ total: sql<string>`sum(${movimientosStock.cantidad})` })
      .from(movimientosStock)
      .where(and(eq(movimientosStock.insumoId, insumoId), eq(movimientosStock.tipo, 'venta_teorica')));
    // Dos porciones de 300 g netos con 10 % de merma: 666,67 g brutos.
    expect(Number(consumo!.total)).toBeCloseTo(-666.6667, 2);
  });

  it('el conteo ciego ajusta el stock y deja la diferencia', async () => {
    const conteoId = await abrirConteo(actor, { depositoId, insumoIds: [insumoId] }, null);
    const abierto = await leerConteo(actor, conteoId);
    expect(abierto.lineas[0]!.teorico).toBeNull();

    await cargarConteo(actor, conteoId, [{ insumoId, contado: 19_000 }]);
    await cerrarConteo(actor, conteoId, null);

    const cerrado = await leerConteo(actor, conteoId);
    expect(cerrado.lineas[0]!.teorico).toBeCloseTo(19_333.3333, 2);
    // Faltan 333,33 g a 2.000 c/g.
    expect(cerrado.lineas[0]!.diferenciaCentavos).toBeCloseTo(-666_666.67, 0);

    const stock = (await leerStock(actor)).insumos.find((i) => i.id === insumoId)!;
    expect(stock.total).toBeCloseTo(19_000);
  });

  it('teórico vs. real separa lo vendido de lo que faltó', async () => {
    const filas = await diferenciasDeStock(actor, hoy(), hoy());
    const fila = filas.find((f) => f.insumoId === insumoId)!;
    expect(fila.teorico).toBeCloseTo(666.6667, 2);
    expect(fila.faltante).toBeCloseTo(333.3333, 2);
    expect(fila.valorFaltante).toBeCloseTo(666_666.67, 0);
  });
});
