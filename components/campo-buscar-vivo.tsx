'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

const ESPERA_MS = 300;

/**
 * Como `CampoBuscar`, pero busca mientras se escribe: cuando se deja de tipear
 * por 300 ms, cambia `?buscar=` en la dirección con `router.replace` y el
 * servidor vuelve a filtrar. Sin recargar la página ni perder el foco, y sin
 * llenar el historial con una entrada por letra. Volver a buscar lleva a la
 * primera página: la que se estaba mirando puede no existir en el resultado nuevo.
 */
export function CampoBuscarVivo({ ruta, valor, placeholder }: { ruta: string; valor: string; placeholder: string }) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [texto, setTexto] = useState(valor);
  const [buscando, iniciar] = useTransition();
  const ultimo = useRef(valor);

  useEffect(() => {
    const limpio = texto.trim();
    if (limpio === ultimo.current) return;
    const espera = setTimeout(() => {
      ultimo.current = limpio;
      // Los otros filtros (período, estado) se conservan; la página no.
      const nuevos = new URLSearchParams(parametros);
      if (limpio) nuevos.set('buscar', limpio);
      else nuevos.delete('buscar');
      nuevos.delete('pagina');
      const consulta = nuevos.toString();
      iniciar(() => router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false }));
    }, ESPERA_MS);
    return () => clearTimeout(espera);
  }, [texto, ruta, router, parametros]);

  return (
    <div className="relative w-full max-w-xs">
      <Search
        size={15}
        strokeWidth={1.5}
        className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-tinta-tenue"
      />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        className="campo pl-9"
        aria-label={placeholder}
        aria-busy={buscando}
      />
    </div>
  );
}
