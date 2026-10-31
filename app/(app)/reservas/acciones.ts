'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { datosReserva } from '@/dominio/reservas';
import { ejecutar, exigirSesion, ipCliente } from '@/lib/sesion';
import { cerrarReserva, guardarReserva, sentarReserva } from '@/servidor/reservas';

async function conActor<T>(fn: (actor: Awaited<ReturnType<typeof exigirSesion>>, ip: string | null) => Promise<T>) {
  return ejecutar(async () => {
    const resultado = await fn(await exigirSesion('reservas.operar'), await ipCliente());
    // Las de hoy también se ven en el salón.
    revalidatePath('/reservas');
    revalidatePath('/');
    return resultado;
  });
}

export async function accionGuardarReserva(datos: unknown) {
  return conActor((actor, ip) => guardarReserva(actor, datosReserva.parse(datos), ip));
}

export async function accionCerrarReserva(id: unknown, estado: unknown) {
  return conActor((actor, ip) => cerrarReserva(actor, z.uuid().parse(id), z.enum(['no_vino', 'cancelada']).parse(estado), ip));
}

export async function accionSentarReserva(id: unknown, cuentaId: unknown) {
  return conActor((actor, ip) => sentarReserva(actor, z.uuid().parse(id), z.uuid().parse(cuentaId), ip));
}
