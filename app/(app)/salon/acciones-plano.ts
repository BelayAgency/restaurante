'use server';

// El plano se edita desde el salón. No hay página que revalidar: los dispositivos
// lo leen del catálogo y lo traen en la próxima sincronización.

import { z } from 'zod';
import { TIPOS_ELEMENTO } from '@/dominio/catalogo';
import { ejecutar, exigirSesion, ipCliente } from '@/lib/sesion';
import { archivarSector, guardarSector } from '@/servidor/plano';

const entero = (min: number, max: number) => z.number().int().min(min).max(max);

const elemento = z.object({
  id: z.uuid(),
  tipo: z.enum(TIPOS_ELEMENTO),
  forma: z.enum(['redonda', 'rectangular']),
  x: entero(-5000, 10000),
  y: entero(-5000, 10000),
  ancho: entero(10, 2000),
  alto: entero(10, 2000),
  rotacion: entero(-360, 360),
  numeroMesa: entero(1, 9999).nullable(),
  capacidad: entero(1, 99).nullable(),
  etiqueta: z.string().trim().max(40).nullable(),
});

const sector = z.object({
  id: z.uuid(),
  nuevo: z.boolean(),
  nombre: z.string().trim().min(1, 'Poné un nombre al sector').max(40),
  orden: entero(0, 100),
  ancho: entero(400, 5000),
  alto: entero(300, 5000),
  elementos: z.array(elemento).max(500),
});

export async function accionGuardarSector(datos: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('plano.administrar');
    await guardarSector(actor, sector.parse(datos), await ipCliente());
  });
}

export async function accionArchivarSector(id: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('plano.administrar');
    await archivarSector(actor, z.uuid().parse(id), await ipCliente());
  });
}
