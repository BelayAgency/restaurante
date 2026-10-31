import 'server-only';
import { Client } from 'pg';
import { urlBase } from '@/db/url';

/**
 * Una sola conexión LISTEN por proceso, repartida entre todos los navegadores
 * conectados al canal en vivo: una por navegador agotaría la pool de una
 * base que corre en una máquina de 1 GB.
 */

type Oyente = (secuencia: number) => void;

const estado = globalThis as unknown as { oyentesEventos?: Set<Oyente>; clienteListen?: Promise<Client> | null };
const oyentes = (estado.oyentesEventos ??= new Set());

function conectar(): Promise<Client> {
  // LISTEN necesita una conexión directa: el pooler de Neon (modo transacción) no reparte avisos.
  const cliente = new Client({ connectionString: urlBase({ directa: true }) });
  const conexion = cliente.connect().then(async () => {
    await cliente.query('LISTEN eventos_nuevos');
    cliente.on('notification', (aviso) => {
      const secuencia = Number(aviso.payload);
      if (Number.isFinite(secuencia)) for (const oyente of oyentes) oyente(secuencia);
    });
    // Si la base se reinicia, se reconecta con el próximo que se suscriba;
    // mientras tanto los dispositivos siguen con su pull periódico.
    cliente.on('error', () => {
      estado.clienteListen = null;
      cliente.end().catch(() => undefined);
    });
    return cliente;
  });
  conexion.catch(() => {
    estado.clienteListen = null;
  });
  return conexion;
}

export function suscribirEventos(oyente: Oyente): () => void {
  estado.clienteListen ??= conectar();
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}
