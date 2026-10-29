import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/servidor/auth';

// Sólo lo que el navegador necesita pedir por su cuenta: renovar la cookie de
// la sesión deslizante y salir. El login va por la server action de
// `servidor/acceso.ts`, que es la que cuenta intentos y bloquea; exponer
// `/sign-in/email` acá sería una puerta lateral sin ese control.
const PERMITIDAS = new Set(['/api/auth/get-session', '/api/auth/sign-out']);

const manejador = toNextJsHandler(auth);

function filtrar(metodo: (pedido: Request) => Promise<Response>) {
  return (pedido: Request) => {
    if (!PERMITIDAS.has(new URL(pedido.url).pathname)) return Promise.resolve(new Response(null, { status: 404 }));
    return metodo(pedido);
  };
}

export const GET = filtrar(manejador.GET);
export const POST = filtrar(manejador.POST);
