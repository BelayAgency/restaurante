'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, BookOpen, ChefHat, CircleDollarSign, LayoutGrid, PencilRuler, Tablet, Users, type LucideIcon } from 'lucide-react';
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
  { href: '/cocina', texto: 'Cocina', icono: ChefHat, requiere: 'cocina.operar' },
  { href: '/caja', texto: 'Caja', icono: CircleDollarSign, requiere: 'caja.operar' },
  { href: '/stock', texto: 'Stock', icono: Boxes, requiere: 'stock.contar' },
  { href: '/carta', texto: 'Carta', icono: BookOpen, requiere: 'carta.administrar' },
  { href: '/plano', texto: 'Plano', icono: PencilRuler, requiere: 'plano.administrar' },
  { href: '/usuarios', texto: 'Usuarios', icono: Users, requiere: 'usuarios.ver' },
  { href: '/dispositivo', texto: 'Este dispositivo', icono: Tablet },
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
