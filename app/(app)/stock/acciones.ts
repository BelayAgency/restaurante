'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ejecutar, exigirSesion, ipCliente } from '@/lib/sesion';
import {
  guardarFotoInsumo,
  guardarProveedor,
  quitarFotoInsumo,
  registrarProduccion,
  registrarSalida,
  transferir,
} from '@/servidor/stock';
import { guardarFotoProducto, quitarFotoProducto } from '@/servidor/carta';
import { archivarProductoConReceta, archivarProductoConStock, guardarProductoConReceta, guardarProductoConStock } from '@/servidor/productos';

const nombre = z.string().trim().min(1, 'Poné un nombre').max(80);
const positivo = z.number().positive('La cantidad tiene que ser mayor a cero').max(1_000_000_000);
const noNegativo = z.number().min(0).max(1_000_000_000);

async function conActor<T>(accion: 'stock.administrar' | 'stock.contar', fn: (actor: Awaited<ReturnType<typeof exigirSesion>>, ip: string | null) => Promise<T>) {
  return ejecutar(async () => {
    const resultado = await fn(await exigirSesion(accion), await ipCliente());
    revalidatePath('/stock', 'layout');
    return resultado;
  });
}

const insumo = z.object({
  id: z.uuid().nullable(),
  nombre,
  tipo: z.enum(['compra', 'preparacion']),
  unidad: z.enum(['g', 'ml', 'u', 'parte']),
  contenidoPorUnidad: positivo.nullable(),
  stockMinimo: noNegativo,
  presentaciones: z.array(z.object({ id: z.uuid().nullable(), nombre, cantidadBase: positivo })).max(10),
});

export async function accionGuardarProveedor(datos: unknown) {
  const esquema = z.object({ id: z.uuid().nullable(), nombre, cuit: z.string().trim().max(20).nullable() });
  return conActor('stock.administrar', (actor, ip) => guardarProveedor(actor, esquema.parse(datos), ip));
}

export async function accionSubirFotoInsumo(id: unknown, base64: unknown) {
  // 600 KB de foto son unos 800 mil caracteres en base64; el resto lo valida el servidor por los bytes.
  return conActor('stock.administrar', (actor, ip) => {
    const datos = z.object({ id: z.uuid(), base64: z.string().max(820_000) }).parse({ id, base64 });
    return guardarFotoInsumo(actor, datos.id, Buffer.from(datos.base64, 'base64'), ip);
  });
}

export async function accionQuitarFotoInsumo(id: unknown) {
  return conActor('stock.administrar', (actor, ip) => quitarFotoInsumo(actor, z.uuid().parse(id), ip));
}

export async function accionRegistrarProduccion(datos: unknown) {
  const esquema = z.object({ preparacionId: z.uuid('Elegí la preparación'), cantidad: positivo, depositoId: z.uuid('Elegí el depósito') });
  return conActor('stock.administrar', (actor, ip) => registrarProduccion(actor, esquema.parse(datos), ip));
}

export async function accionRegistrarSalida(datos: unknown) {
  const esquema = z.object({
    tipo: z.enum(['merma', 'vencimiento', 'comida_personal']),
    insumoId: z.uuid('Elegí el insumo'),
    depositoId: z.uuid('Elegí el depósito'),
    cantidad: positivo,
    motivo: z.string().trim().min(3, 'El motivo es obligatorio').max(140),
  });
  return conActor('stock.administrar', (actor, ip) => registrarSalida(actor, esquema.parse(datos), ip));
}

export async function accionTransferir(datos: unknown) {
  const esquema = z.object({ insumoId: z.uuid('Elegí el insumo'), desdeId: z.uuid('Elegí el origen'), haciaId: z.uuid('Elegí el destino'), cantidad: positivo });
  return conActor('stock.administrar', (actor, ip) => transferir(actor, esquema.parse(datos), ip));
}

const venta = z
  .object({
    vendible: z.boolean(),
    precioCentavos: z.number().int().min(0).max(100_000_000_00),
    categoriaId: z.uuid().nullable(),
    estacionId: z.uuid().nullable(),
  })
  .refine((v) => !v.vendible || (v.precioCentavos > 0 && v.categoriaId && v.estacionId), 'Para venderlo poné el precio, la categoría y la estación');

export async function accionGuardarProductoConStock(datos: unknown) {
  const esquema = z.object({ insumo, venta });
  return conActor('stock.administrar', (actor, ip) => guardarProductoConStock(actor, esquema.parse(datos), ip));
}

export async function accionGuardarProductoConReceta(datos: unknown) {
  const esquema = z.object({
    id: z.uuid().nullable(),
    nombre,
    venta,
    lineas: z.array(z.object({ insumoId: z.uuid(), cantidad: positivo })).min(1, 'Agregá al menos un producto a la receta').max(60),
  });
  return conActor('stock.administrar', (actor, ip) => guardarProductoConReceta(actor, esquema.parse(datos), ip));
}

export async function accionArchivarProductoConStock(insumoId: unknown) {
  return conActor('stock.administrar', (actor, ip) => archivarProductoConStock(actor, z.uuid().parse(insumoId), ip));
}

export async function accionArchivarProductoConReceta(productoId: unknown) {
  return conActor('stock.administrar', (actor, ip) => archivarProductoConReceta(actor, z.uuid().parse(productoId), ip));
}

export async function accionSubirFotoProducto(id: unknown, base64: unknown) {
  return conActor('stock.administrar', (actor, ip) => {
    const datos = z.object({ id: z.uuid(), base64: z.string().max(820_000) }).parse({ id, base64 });
    return guardarFotoProducto(actor, datos.id, Buffer.from(datos.base64, 'base64'), ip);
  });
}

export async function accionQuitarFotoProducto(id: unknown) {
  return conActor('stock.administrar', (actor, ip) => quitarFotoProducto(actor, z.uuid().parse(id), ip));
}
