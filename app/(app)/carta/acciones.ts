'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ejecutar, exigirSesion, ipCliente } from '@/lib/sesion';
import {
  archivarCategoria,
  archivarEstacion,
  archivarGrupo,
  archivarProducto,
  cambiarDisponibilidad,
  guardarCategoria,
  guardarEstacion,
  guardarGrupo,
  guardarProducto,
} from '@/servidor/carta';

const nombre = z.string().trim().min(1, 'Poné un nombre').max(80, 'Máximo 80 caracteres');
const centavos = z.number().int().min(0).max(1_000_000_000);
const idONulo = z.uuid().nullable();

async function conActor<T>(fn: (actor: Awaited<ReturnType<typeof exigirSesion>>, ip: string | null) => Promise<T>) {
  return ejecutar(async () => {
    const resultado = await fn(await exigirSesion('carta.administrar'), await ipCliente());
    revalidatePath('/carta');
    return resultado;
  });
}

export async function accionGuardarEstacion(id: unknown, valor: unknown) {
  return conActor((actor, ip) => guardarEstacion(actor, { id: idONulo.parse(id), nombre: nombre.parse(valor) }, ip));
}

export async function accionArchivarEstacion(id: unknown) {
  return conActor((actor, ip) => archivarEstacion(actor, z.uuid().parse(id), ip));
}

export async function accionGuardarCategoria(id: unknown, valor: unknown) {
  return conActor((actor, ip) => guardarCategoria(actor, { id: idONulo.parse(id), nombre: nombre.parse(valor) }, ip));
}

export async function accionArchivarCategoria(id: unknown) {
  return conActor((actor, ip) => archivarCategoria(actor, z.uuid().parse(id), ip));
}

const producto = z.object({
  id: idONulo,
  nombre,
  categoriaId: z.uuid('Elegí una categoría'),
  estacionId: z.uuid('Elegí dónde se prepara'),
  precioCentavos: centavos,
  disponible: z.boolean(),
  grupoIds: z.array(z.uuid()).max(20),
});

export async function accionGuardarProducto(datos: unknown) {
  return conActor((actor, ip) => guardarProducto(actor, producto.parse(datos), ip));
}

export async function accionArchivarProducto(id: unknown) {
  return conActor((actor, ip) => archivarProducto(actor, z.uuid().parse(id), ip));
}

export async function accionDisponibilidad(id: unknown, disponible: unknown) {
  return conActor((actor, ip) => cambiarDisponibilidad(actor, z.uuid().parse(id), z.boolean().parse(disponible), ip));
}

const grupo = z.object({
  id: idONulo,
  nombre,
  obligatorio: z.boolean(),
  multiple: z.boolean(),
  opciones: z.array(z.object({ id: idONulo, nombre, precioCentavos: centavos })).min(1, 'Agregá al menos una opción').max(30),
});

export async function accionGuardarGrupo(datos: unknown) {
  return conActor((actor, ip) => guardarGrupo(actor, grupo.parse(datos), ip));
}

export async function accionArchivarGrupo(id: unknown) {
  return conActor((actor, ip) => archivarGrupo(actor, z.uuid().parse(id), ip));
}
