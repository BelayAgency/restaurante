import { connection } from 'next/server';
import { exigirSesion, respuestaDeError } from '@/lib/sesion';
import { suscribirEventos } from '@/servidor/vivo';

// Cloudflare corta una respuesta que no manda nada en 100 segundos.
const LATIDO_MS = 25_000;

export async function GET(pedido: Request) {
  // Sin esto el build intenta prerenderizarla y choca con la sesión.
  await connection();
  try {
    await exigirSesion();
  } catch (error) {
    return respuestaDeError(error);
  }

  const codificador = new TextEncoder();
  let cerrar = () => {};

  const flujo = new ReadableStream<Uint8Array>({
    start(control) {
      const enviar = (texto: string) => {
        try {
          control.enqueue(codificador.encode(texto));
        } catch {
          cerrar();
        }
      };
      const desuscribir = suscribirEventos((secuencia) => enviar(`event: secuencia\ndata: ${secuencia}\n\n`));
      const latido = setInterval(() => enviar(': latido\n\n'), LATIDO_MS);
      cerrar = () => {
        clearInterval(latido);
        desuscribir();
        try {
          control.close();
        } catch {
          // ya estaba cerrado
        }
      };
      pedido.signal.addEventListener('abort', () => cerrar());
      enviar('retry: 5000\n\n');
    },
    cancel() {
      cerrar();
    },
  });

  return new Response(flujo, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
