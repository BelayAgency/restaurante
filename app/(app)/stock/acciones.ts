'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ejecutar, exigirSesion, ipCliente } from '@/lib/sesion';
import {
  abrirConteo,
  archivarInsumo,
  cargarConteo,
  cerrarConteo,
  guardarInsumo,
  guardarProveedor,
  guardarReceta,
  registrarCompra,
  registrarProduccion,
  registrarSalida,
  transferir,
} from '@/servidor/stock';

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
  unidad: z.enum(['g', 'ml', 'u']),
  stockMinimo: noNegativo,
  presentaciones: z.array(z.object({ id: z.uuid().nullable(), nombre, cantidadBase: positivo })).max(10),
});

export async function accionGuardarInsumo(datos: unknown) {
  return conActor('stock.administrar', (actor, ip) => guardarInsumo(actor, insumo.parse(datos), ip));
}

export async function accionArchivarInsumo(id: unknown) {
  return conActor('stock.administrar', (actor, ip) => archivarInsumo(actor, z.uuid().parse(id), ip));
}

export async function accionGuardarProveedor(datos: unknown) {
  const esquema = z.object({ id: z.uuid().nullable(), nombre, cuit: z.string().trim().max(20).nullable() });
  return conActor('stock.administrar', (actor, ip) => guardarProveedor(actor, esquema.parse(datos), ip));
}

const receta = z.object({
  productoId: z.uuid().nullable(),
  preparacionId: z.uuid().nullable(),
  rendimiento: positivo,
  lineas: z.array(z.object({ insumoId: z.uuid(), cantidad: positivo, mermaPorcentaje: z.number().min(0).max(95) })).max(60),
});

export async function accionGuardarReceta(datos: unknown) {
  return conActor('stock.administrar', (actor, ip) => guardarReceta(actor, receta.parse(datos), ip));
}

const compra = z.object({
  proveedorId: z.uuid('Elegí el proveedor'),
  depositoId: z.uuid('Elegí el depósito'),
  numeroFactura: z.string().trim().min(1, 'Poné el número de factura').max(40),
  fecha: z.iso.date('La fecha no es válida'),
  lineas: z
    .array(z.object({ insumoId: z.uuid('Elegí el insumo'), presentacionId: z.uuid().nullable(), cantidadPresentaciones: positivo, costoCentavos: z.number().int().min(0) }))
    .min(1, 'Agregá al menos un insumo')
    .max(100),
});

export async function accionRegistrarCompra(datos: unknown) {
  return conActor('stock.administrar', (actor, ip) => registrarCompra(actor, compra.parse(datos), ip));
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

export async function accionAbrirConteo(datos: unknown) {
  const esquema = z.object({ depositoId: z.uuid('Elegí el depósito'), insumoIds: z.array(z.uuid()).max(500).nullable() });
  return conActor('stock.contar', (actor, ip) => abrirConteo(actor, esquema.parse(datos), ip));
}

export async function accionCargarConteo(id: unknown, valores: unknown) {
  const esquema = z.array(z.object({ insumoId: z.uuid(), contado: noNegativo.nullable() })).max(500);
  return conActor('stock.contar', (actor) => cargarConteo(actor, z.uuid().parse(id), esquema.parse(valores)));
}

export async function accionCerrarConteo(id: unknown) {
  return conActor('stock.contar', (actor, ip) => cerrarConteo(actor, z.uuid().parse(id), ip));
}
