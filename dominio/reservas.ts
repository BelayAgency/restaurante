import { z } from 'zod';
import { nombrePersona } from './texto-mail';

export type EstadoReserva = 'pendiente' | 'sentada' | 'no_vino' | 'cancelada';

export const NOMBRE_ESTADO_RESERVA: Record<EstadoReserva, string> = {
  pendiente: 'Pendiente',
  sentada: 'Llegó',
  no_vino: 'No vino',
  cancelada: 'Cancelada',
};

const fecha = z.iso.date('La fecha no es válida');

export const datosReserva = z.object({
  id: z.uuid().nullable(),
  nombreCliente: nombrePersona,
  telefono: z
    .string()
    .trim()
    .max(30, 'Máximo 30 caracteres')
    .regex(/^[\d\s()+-]*$/, 'Sólo números, espacios, + y guiones')
    .transform((v) => v || null)
    .nullable(),
  personas: z.number().int().min(1, 'Al menos una persona').max(99),
  fecha,
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora no es válida'),
  nota: z
    .string()
    .trim()
    .max(200, 'Máximo 200 caracteres')
    .transform((v) => v || null)
    .nullable(),
});

export type DatosReserva = z.infer<typeof datosReserva>;

export const fechaReserva = fecha;

const ZONA = 'America/Argentina/Buenos_Aires';

/**
 * El momento de una reserva a partir de lo que se carga: un día y una hora del
 * local. Argentina no tiene horario de verano, así que el desfasaje es fijo.
 */
export function momentoReserva(dia: string, hora: string): Date {
  return new Date(`${dia}T${hora}:00-03:00`);
}

/** El día del local de un momento, `YYYY-MM-DD`. */
export function diaLocal(momento: Date | number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(momento);
}

/** La hora del local de un momento, `HH:MM`. */
export function horaLocal(momento: Date): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(momento);
}

/** El día anterior o el siguiente de un `YYYY-MM-DD`, sin pasar por la hora del sistema. */
export function correrDia(dia: string, dias: number): string {
  const momento = new Date(`${dia}T12:00:00Z`);
  momento.setUTCDate(momento.getUTCDate() + dias);
  return momento.toISOString().slice(0, 10);
}
