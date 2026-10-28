import 'server-only';
import type { ServicioFacturacion } from '@/components/cartel-pago';

/**
 * Qué dice el panel de Belay sobre este sistema: si hay un cobro con problema
 * y, sobre todo, si hay que bloquearlo (prompt-base sección 6).
 *
 * Se copia a `lib/` y se usa desde el servidor, nunca desde el navegador:
 * la llave no puede llegar al cliente, y el bloqueo se cumple acá (el 423 de
 * las rutas), no en la pantalla.
 *
 * Tres decisiones que no se tocan:
 *
 * 1. **Caché de 60 segundos para todo el proceso.** `/facturacion` acepta 60
 *    consultas por minuto por llave. Preguntar en cada request lo pasaría en
 *    segundos con pocos usuarios, y un 429 se trata como "el panel no
 *    contesta": el bloqueo se apagaría solo justo cuando más se usa el sistema.
 *    Con la caché, un bloqueo o desbloqueo desde el panel tarda como mucho un
 *    minuto en verse acá.
 *
 * 2. **Falla abierto.** Timeout de 5 segundos, y ante cualquier error —panel
 *    caído, 5xx, 429, respuesta rara, llave que falta— devuelve `null`, que se
 *    lee como "al día". Un problema de red de Belay no puede dejar a un cliente
 *    afuera de su sistema.
 *
 * 3. **Una sola consulta en vuelo.** Si veinte requests llegan con la caché
 *    vencida, esperan la misma promesa en vez de salir veinte pedidos juntos.
 */

const CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;

let cache: { valor: ServicioFacturacion | null; vence: number } | null = null;
let enVuelo: Promise<ServicioFacturacion | null> | null = null;
let avisoSinLlave = false;

async function consultar(): Promise<ServicioFacturacion | null> {
  const url = process.env.BELAY_API_URL;
  const llave = process.env.BELAY_API_KEY;

  if (!url || !llave) {
    if (!avisoSinLlave) {
      avisoSinLlave = true;
      // Una vez, no en cada consulta: sin llave el sistema anda igual, sólo
      // que no se entera de cobros ni de bloqueos (sección 13.3).
      console.warn('[belay] falta BELAY_API_URL o BELAY_API_KEY: no se consulta el estado del servicio');
    }
    return null;
  }

  try {
    const respuesta = await fetch(`${url}/facturacion?limite=1`, {
      headers: { authorization: `Bearer ${llave}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!respuesta.ok) return null;

    const datos = (await respuesta.json()) as { servicio?: Partial<ServicioFacturacion> };
    const s = datos.servicio;
    // Se valida la forma mínima: algo que no entendemos no puede bloquear.
    if (!s || typeof s.bloquear !== 'boolean' || typeof s.estado !== 'string') return null;

    return {
      estado: s.estado,
      graciaHasta: typeof s.graciaHasta === 'string' ? s.graciaHasta : null,
      bloquear: s.bloquear,
      motivoBloqueo: s.motivoBloqueo === 'panel' || s.motivoBloqueo === 'pago' ? s.motivoBloqueo : null,
    };
  } catch {
    return null;
  }
}

/** El `servicio` de Belay, o `null` si no se sabe (y entonces no se bloquea). */
export async function leerServicioBelay(): Promise<ServicioFacturacion | null> {
  const ahora = Date.now();
  if (cache && cache.vence > ahora) return cache.valor;

  enVuelo ??= consultar().finally(() => {
    enVuelo = null;
  });

  const valor = await enVuelo;
  cache = { valor, vence: Date.now() + CACHE_MS };
  return valor;
}

/**
 * Lo que mira el servidor antes de atender una ruta del área autenticada: si
 * da `true`, se responde `423 { error: 'Sistema suspendido' }` sin leer ni
 * escribir nada. Quedan afuera el healthcheck, el login/logout y los webhooks
 * de terceros (sección 6).
 */
export async function sistemaBloqueado(): Promise<boolean> {
  return (await leerServicioBelay())?.bloquear === true;
}

/** Respuesta estándar para una ruta rechazada por el bloqueo. */
export function respuestaBloqueado(): Response {
  return Response.json({ error: 'Sistema suspendido' }, { status: 423 });
}
