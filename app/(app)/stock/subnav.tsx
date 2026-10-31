'use client';

import { startTransition, useEffect, useOptimistic } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Tabs } from '@/components/tabs';
import { puede } from '@/dominio/permisos';
import { useSesion } from '../sesion-cliente';

const SECCIONES = [
  { href: '/stock', texto: 'Stock', administra: false },
  { href: '/stock/productos', texto: 'Productos', administra: true },
  { href: '/stock/compras', texto: 'Compras', administra: true },
];

/** Las secciones de stock. Son páginas y no paneles: cada una trae sus datos del servidor. */
export function SubnavStock() {
  const ruta = usePathname();
  const router = useRouter();
  const { vista } = useSesion();
  const visibles = SECCIONES.filter((s) => !s.administra || puede({ rol: vista }, 'stock.administrar'));
  const activa = [...visibles].reverse().find((s) => (s.href === '/stock' ? ruta === '/stock' : ruta.startsWith(s.href)))?.href ?? '/stock';
  // La pestaña se mueve al tocarla, no cuando termina la navegación: si no, el
  // fondo espera a la página nueva y salta en vez de deslizarse.
  const [elegida, setElegida] = useOptimistic(activa);
  const hrefs = visibles.map((s) => s.href).join(' ');

  // Las secciones no tienen `loading.tsx` propio (sólo el de `/stock`, para
  // entrar desde la navegación): entre pestañas la página actual queda hasta
  // que llega la otra, en vez de parpadear un esqueleto. Precargarlas acorta esa espera.
  useEffect(() => {
    for (const href of hrefs.split(' ')) router.prefetch(href);
  }, [hrefs, router]);

  return (
    <div className="mb-5 overflow-x-auto p-px">
      <Tabs
        etiqueta="Secciones de stock"
        parejas
        valor={elegida}
        alCambiar={(href) =>
          startTransition(() => {
            setElegida(href);
            router.push(href);
          })
        }
        opciones={visibles.map((s) => ({ valor: s.href, etiqueta: s.texto }))}
      />
    </div>
  );
}
