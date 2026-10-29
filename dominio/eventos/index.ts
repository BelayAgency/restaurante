import { z } from 'zod';
import type { Accion } from '../permisos';

/**
 * Toda operación del salón es un evento append-only con id generado en el
 * dispositivo: reenviarlo no duplica nada, y el estado de una mesa o de una
 * caja se deriva de sus eventos. Los eventos son hechos que se suman
 * ("se agregó el ítem X"), nunca estados que se pisan ("la mesa tiene estos
 * ítems"): así dos dispositivos sin red no se pisan.
 *
 * Agregar un tipo es agregarlo a `DEFINICIONES`. El esquema de `datos` y la
 * acción que exige viajan juntos para que no haya tipo sin regla.
 */

const DEFINICIONES = {
  operador_cambiado: {
    agregado: 'dispositivo',
    accion: 'operador.cambiar',
    datos: z.object({ operadorAnteriorId: z.string().min(1).nullable() }),
  },
  pin_fallido: {
    agregado: 'dispositivo',
    accion: 'operador.cambiar',
    datos: z.object({ usuarioIntentadoId: z.string().min(1) }),
  },
} as const satisfies Record<string, { agregado: string; accion: Accion; datos: z.ZodType }>;

export type TipoEvento = keyof typeof DEFINICIONES;
export const TIPOS_EVENTO = Object.keys(DEFINICIONES) as TipoEvento[];

const sobre = z.object({
  id: z.uuid(),
  version: z.literal(1),
  dispositivoId: z.uuid(),
  operadorId: z.string().min(1),
  autorizadoPorId: z.string().min(1).nullable(),
  motivoId: z.string().min(1).nullable(),
  motivoTexto: z.string().trim().max(280).nullable(),
  creadoEnDispositivo: z.iso.datetime({ offset: true }),
  agregadoId: z.string().min(1),
});

export const esquemaEvento = z.discriminatedUnion('tipo', [
  sobre.extend({ tipo: z.literal('operador_cambiado'), datos: DEFINICIONES.operador_cambiado.datos }),
  sobre.extend({ tipo: z.literal('pin_fallido'), datos: DEFINICIONES.pin_fallido.datos }),
]);

export type EventoNuevo = z.infer<typeof esquemaEvento>;

/** Un evento tal como lo devuelve el servidor: con su lugar en el orden global. */
export type EventoConfirmado = EventoNuevo & {
  secuencia: number;
  recibidoEn: string;
};

export function definicion(tipo: TipoEvento) {
  return DEFINICIONES[tipo];
}

export const MAX_EVENTOS_POR_ENVIO = 200;
