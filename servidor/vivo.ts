import 'server-only';
import { base } from '@/db/cliente';

/**
 * Los avisos de eventos nuevos, desde la base embebida de la demo: el trigger
 * de la tabla hace NOTIFY y PGlite lo entrega en el mismo proceso.
 */

type Oyente = (secuencia: number) => void;

const estado = globalThis as unknown as { oyentesEventos?: Set<Oyente>; escuchando?: boolean };
const oyentes = (estado.oyentesEventos ??= new Set());

export function suscribirEventos(oyente: Oyente): () => void {
  if (!estado.escuchando) {
    estado.escuchando = true;
    void base.listen('eventos_nuevos', (aviso) => {
      const secuencia = Number(aviso);
      if (Number.isFinite(secuencia)) for (const o of oyentes) o(secuencia);
    });
  }
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}
