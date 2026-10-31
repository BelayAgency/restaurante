'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Boxes, CalendarDays, ChefHat, LayoutGrid, type LucideIcon } from 'lucide-react';
import { puede, type Accion } from '@/dominio/permisos';
import { useSesion } from './sesion-cliente';

interface Seccion {
  href: string;
  texto: string;
  icono: LucideIcon;
  requiere?: Accion;
}

const SECCIONES: Seccion[] = [
  { href: '/', texto: 'Salón', icono: LayoutGrid, requiere: 'salon.operar' },
  { href: '/reservas', texto: 'Reservas', icono: CalendarDays, requiere: 'reservas.operar' },
  { href: '/cocina', texto: 'Cocina', icono: ChefHat, requiere: 'cocina.operar' },
  { href: '/stock', texto: 'Stock', icono: Boxes, requiere: 'stock.contar' },
  { href: '/reportes', texto: 'Reportes', icono: BarChart3, requiere: 'reportes.ver' },
];

export function Navegacion() {
  const ruta = usePathname();
  const { vista } = useSesion();

  return SECCIONES.filter((s) => !s.requiere || puede({ rol: vista }, s.requiere)).map((s) => {
    const activa = s.href === '/' ? ruta === '/' : ruta.startsWith(s.href);
    return (
      <Link key={s.href} href={s.href} className="fila-nav" data-activa={activa || undefined} aria-current={activa ? 'page' : undefined}>
        <span className="fila-nav-icono">
          <s.icono size={17} strokeWidth={1.5} />
        </span>
        <span className="truncate">{s.texto}</span>
      </Link>
    );
  });
}
