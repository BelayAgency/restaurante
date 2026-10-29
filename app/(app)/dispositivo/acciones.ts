'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { nombrePersona } from '@/dominio/texto-mail';
import { ejecutar, exigirSesion, ipCliente } from '@/lib/sesion';
import { registrarDispositivo, revocarDispositivo } from '@/servidor/sync';

export async function accionRegistrarDispositivo(id: unknown, nombre: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('dispositivos.registrar');
    await registrarDispositivo(actor, z.uuid().parse(id), nombrePersona.parse(nombre), await ipCliente());
    revalidatePath('/dispositivo');
  });
}

export async function accionRevocarDispositivo(id: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('dispositivos.administrar');
    await revocarDispositivo(actor, z.uuid().parse(id), await ipCliente());
    revalidatePath('/dispositivo');
  });
}
