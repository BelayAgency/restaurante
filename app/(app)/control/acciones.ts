'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { LISTA_ACCIONES } from '@/dominio/autorizaciones';
import { ROLES } from '@/dominio/roles';
import { ejecutar, exigirSesion, ipCliente } from '@/lib/sesion';
import { guardarConfiguracionControl, marcarAlertaVista } from '@/servidor/control';

export async function accionMarcarVista(clave: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('control.ver');
    await marcarAlertaVista(actor, z.string().min(1).max(120).parse(clave));
    revalidatePath('/control/alertas');
  });
}

const accion = z.enum(LISTA_ACCIONES as [string, ...string[]]);
const entero = (max: number) => z.number().int().min(0).max(max);

const configuracion = z.object({
  reglas: z.record(accion, z.array(z.enum(ROLES)).min(1, 'Cada acción necesita al menos un rol que la autorice')),
  umbrales: z.object({
    minutosMesaAbierta: entero(24 * 60),
    porcentajeDescuento: entero(100),
    diferenciaCajaCentavos: entero(1_000_000_000),
    diferenciaConteoCentavos: entero(1_000_000_000),
    horaApertura: entero(23),
    horaCierre: entero(23),
  }),
  motivos: z.array(z.object({ id: z.uuid().nullable(), accion, texto: z.string().trim().min(2, 'Un motivo no puede quedar vacío').max(80) })).max(200),
});

export async function accionGuardarConfiguracion(datos: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('control.configurar');
    await guardarConfiguracionControl(actor, configuracion.parse(datos) as Parameters<typeof guardarConfiguracionControl>[1], await ipCliente());
    revalidatePath('/control', 'layout');
  });
}
