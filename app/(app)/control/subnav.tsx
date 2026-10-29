'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Tabs } from '@/components/tabs';
import { puede } from '@/dominio/permisos';
import { useSesion } from '../sesion-cliente';

export function SubnavControl() {
  const ruta = usePathname();
  const router = useRouter();
  const { vista } = useSesion();
  const secciones = [
    { valor: '/control', etiqueta: 'Dónde se va la plata' },
    { valor: '/control/alertas', etiqueta: 'Alertas' },
    ...(puede({ rol: vista }, 'control.configurar') ? [{ valor: '/control/configuracion', etiqueta: 'Configuración' }] : []),
  ];
  const activa = [...secciones].reverse().find((s) => (s.valor === '/control' ? ruta === '/control' : ruta.startsWith(s.valor)))?.valor ?? '/control';
  return (
    <div className="mb-5 overflow-x-auto">
      <Tabs etiqueta="Secciones de control" valor={activa} alCambiar={(href) => router.push(href)} opciones={secciones} />
    </div>
  );
}
