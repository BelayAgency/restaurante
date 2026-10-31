// El service worker se sirve desde una ruta y no desde /public para poder
// atar el nombre del caché al build: cada deploy trae un caché nuevo y borra
// el anterior, así nadie queda atrapado en una versión vieja.
const VERSION = process.env.NEXT_PUBLIC_ID_BUILD ?? 'dev';

const CODIGO = `
const CACHE = 'restaurante-${VERSION}';
const PRECARGA = ['/', '/dispositivo', '/entrar', '/manifest.webmanifest', '/icono.svg'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(PRECARGA.map((url) => cache.add(new Request(url, { credentials: 'same-origin' })).catch(() => undefined))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c.startsWith('restaurante-') && c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

async function primeroCache(pedido) {
  const guardado = await caches.match(pedido);
  if (guardado) return guardado;
  const respuesta = await fetch(pedido);
  if (respuesta.ok) (await caches.open(CACHE)).put(pedido, respuesta.clone());
  return respuesta;
}

async function primeroRed(pedido, respaldo) {
  try {
    const respuesta = await fetch(pedido);
    if (respuesta.ok && respuesta.type === 'basic') (await caches.open(CACHE)).put(pedido, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardado = (await caches.match(pedido)) ?? (respaldo ? await caches.match(respaldo) : undefined);
    if (guardado) return guardado;
    throw error;
  }
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // La sincronización y la sesión nunca salen del caché: una respuesta vieja
  // ahí haría creer al dispositivo que está al día.
  if (url.pathname.startsWith('/api/sync') || url.pathname.startsWith('/api/auth') || url.pathname === '/api/version') return;

  // Las fotos llevan la versión en la dirección: una vez guardadas no cambian, y así se ven sin red.
  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icono.svg' || (url.pathname.startsWith('/api/fotos/') && url.searchParams.has('v'))) {
    evento.respondWith(primeroCache(pedido));
    return;
  }
  if (pedido.mode === 'navigate') {
    evento.respondWith(primeroRed(pedido, '/'));
    return;
  }
  evento.respondWith(primeroRed(pedido));
});
`;

export function GET() {
  return new Response(CODIGO, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'service-worker-allowed': '/',
    },
  });
}
