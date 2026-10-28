'use client';

/*
 * Cartel de nueva versión (prompt-base sección 7). Cableado que necesita:
 *
 * 1. next.config.ts embebe el id del build:
 *      const idBuild = process.env.ID_BUILD ?? 'dev';
 *      env: { NEXT_PUBLIC_ID_BUILD: idBuild }
 *    (en el Dockerfile, ID_BUILD llega como build-arg con el SHA del commit).
 * 2. Un endpoint liviano app/api/version/route.ts (force-dynamic, no-store)
 *    que devuelve { id: process.env.NEXT_PUBLIC_ID_BUILD ?? 'dev' }.
 * 3. El componente va arriba de todo en el layout autenticado, por fuera del
 *    marco.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const ID_BUILD_LOCAL = process.env.NEXT_PUBLIC_ID_BUILD;
const INTERVALO_MS = 5 * 60_000;

/* Franja angosta arriba de todo: avisa que hay un deploy más nuevo que la
   versión cargada en el navegador. No bloquea nada y, cerrada, no vuelve a
   aparecer hasta la próxima carga de la página. */
export function CartelNuevaVersion() {
  const [hayNueva, setHayNueva] = useState(false);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    let activo = true;

    async function comprobar(): Promise<void> {
      try {
        const respuesta = await fetch('/api/version', { cache: 'no-store' });
        if (!respuesta.ok) return;
        const { id } = (await respuesta.json()) as { id?: string };
        if (activo && id && ID_BUILD_LOCAL && id !== ID_BUILD_LOCAL) setHayNueva(true);
      } catch {
        // Sin conexión no hay nada que anunciar.
      }
    }

    const reloj = setInterval(comprobar, INTERVALO_MS);
    const alVolverALaPestana = () => {
      if (document.visibilityState === 'visible') void comprobar();
    };
    document.addEventListener('visibilitychange', alVolverALaPestana);
    return () => {
      activo = false;
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolverALaPestana);
    };
  }, []);

  if (!hayNueva || cerrado) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-acento px-4 py-1.5 text-[13px] text-white">
      <span>Nueva actualización disponible</span>
      <button
        type="button"
        onClick={() => location.reload()}
        className="rounded-md bg-white/15 px-2.5 py-0.5 font-medium transition-colors hover:bg-white/25"
      >
        Actualizar
      </button>
      <button
        type="button"
        onClick={() => setCerrado(true)}
        aria-label="Cerrar el aviso"
        className="rounded-md p-1 transition-colors hover:bg-white/15"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
