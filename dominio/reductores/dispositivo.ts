import type { EventoNuevo } from '../eventos';

export interface EstadoDispositivo {
  operadorId: string | null;
  pinesFallidos: { usuarioId: string; momento: string }[];
}

/**
 * El estado de un dispositivo se deriva de sus eventos, en el orden en que se
 * aplican: confirmados por secuencia y después la bandeja propia. Nada se
 * guarda "ya resuelto".
 */
export function reducirDispositivo(eventos: Iterable<EventoNuevo>): EstadoDispositivo {
  const estado: EstadoDispositivo = { operadorId: null, pinesFallidos: [] };
  for (const evento of eventos) {
    if (evento.tipo === 'operador_cambiado') {
      estado.operadorId = evento.operadorId;
      estado.pinesFallidos = [];
    } else if (evento.tipo === 'pin_fallido') {
      estado.pinesFallidos.push({ usuarioId: evento.datos.usuarioIntentadoId, momento: evento.creadoEnDispositivo });
    }
  }
  return estado;
}

export const MAX_PINES_FALLIDOS = 5;
export const MINUTOS_BLOQUEO_PIN = 5;

/** Cinco PIN mal seguidos para la misma persona la frenan unos minutos en este dispositivo. */
export function pinBloqueado(estado: EstadoDispositivo, usuarioId: string, ahora: Date): boolean {
  const desde = ahora.getTime() - MINUTOS_BLOQUEO_PIN * 60_000;
  const recientes = estado.pinesFallidos.filter((f) => f.usuarioId === usuarioId && new Date(f.momento).getTime() >= desde);
  return recientes.length >= MAX_PINES_FALLIDOS;
}
