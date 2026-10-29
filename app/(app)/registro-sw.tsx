'use client';

import { useEffect } from 'react';

export function RegistroServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      // En desarrollo un service worker sirve código viejo después de cada guardado.
      void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
      return;
    }
    // `updateViaCache: 'none'`: con el default, el navegador busca sw.js en su
    // caché HTTP y Cloudflare puede devolverlo viejo durante horas.
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
  }, []);
  return null;
}
