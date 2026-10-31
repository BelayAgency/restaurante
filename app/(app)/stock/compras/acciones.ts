'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { datosComprobante, datosCorreccion, datosPago, motivoAnulacion } from '@/dominio/compras';
import { ejecutar, exigirSesion, ipCliente } from '@/lib/sesion';
import { anularFactura, anularPago, corregirFactura, fichaFactura, marcarReclamo, registrarPago, resumenDeCuenta } from '@/servidor/compras';
import { registrarCompra } from '@/servidor/stock';

async function conActor<T>(fn: (actor: Awaited<ReturnType<typeof exigirSesion>>, ip: string | null) => Promise<T>, revalidar = true) {
  return ejecutar(async () => {
    const resultado = await fn(await exigirSesion('stock.administrar'), await ipCliente());
    // Una compra con insumos también cambia el stock.
    if (revalidar) revalidatePath('/stock', 'layout');
    return resultado;
  });
}

export async function accionRegistrarComprobante(datos: unknown) {
  return conActor((actor, ip) => registrarCompra(actor, datosComprobante.parse(datos), ip));
}

export async function accionFichaFactura(id: unknown) {
  return conActor((actor) => fichaFactura(actor, z.uuid().parse(id)), false);
}

export async function accionResumenDeCuenta(proveedorId: unknown) {
  return conActor((actor) => resumenDeCuenta(actor, z.uuid().parse(proveedorId)), false);
}

export async function accionCorregirFactura(id: unknown, datos: unknown) {
  return conActor((actor, ip) => corregirFactura(actor, z.uuid().parse(id), datosCorreccion.parse(datos), ip));
}

export async function accionMarcarReclamo(id: unknown, enReclamo: unknown) {
  return conActor((actor, ip) => marcarReclamo(actor, z.uuid().parse(id), z.boolean().parse(enReclamo), ip));
}

export async function accionAnularFactura(id: unknown, motivo: unknown) {
  return conActor((actor, ip) => anularFactura(actor, z.uuid().parse(id), motivoAnulacion.parse(motivo), ip));
}

export async function accionRegistrarPago(datos: unknown) {
  return conActor((actor, ip) => registrarPago(actor, datosPago.parse(datos), ip));
}

export async function accionAnularPago(id: unknown, motivo: unknown) {
  return conActor((actor, ip) => anularPago(actor, z.uuid().parse(id), motivoAnulacion.parse(motivo), ip));
}
