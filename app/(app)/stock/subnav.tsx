'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Tabs } from '@/components/tabs';
import { puede } from '@/dominio/permisos';
import { useSesion } from '../sesion-cliente';

const SECCIONES = [
  { href: '/stock', texto: 'Stock', administra: false },
  { href: '/stock/recetas', texto: 'Recetas', administra: true },
  { href: '/stock/compras', texto: 'Compras', administra: true },
  { href: '/stock/conteos', texto: 'Conteos', administra: false },
  { href: '/stock/diferencias', texto: 'Teórico vs. real', administra: true },
];

/** Las secciones de stock. Son páginas y no paneles: cada una trae sus datos del servidor. */
export function SubnavStock() {
  const ruta = usePathname();
  const router = useRouter();
  const { vista } = useSesion();
  const visibles = SECCIONES.filter((s) => !s.administra || puede({ rol: vista }, 'stock.administrar'));
  const activa = [...visibles].reverse().find((s) => (s.href === '/stock' ? ruta === '/stock' : ruta.startsWith(s.href)))?.href ?? '/stock';

  return (
    <div className="mb-5 overflow-x-auto">
      <Tabs etiqueta="Secciones de stock" valor={activa} alCambiar={(href) => router.push(href)} opciones={visibles.map((s) => ({ valor: s.href, etiqueta: s.texto }))} />
    </div>
  );
}
