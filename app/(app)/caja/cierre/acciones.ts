'use server';

import { revalidatePath } from 'next/cache';
import { ejecutar, exigirSesion } from '@/lib/sesion';
import { cerrarDia } from '@/servidor/dia';

export async function accionCerrarDia() {
  return ejecutar(async () => {
    const actor = await exigirSesion('dia.cerrar');
    const totales = await cerrarDia(actor);
    revalidatePath('/caja/cierre');
    return totales;
  });
}
