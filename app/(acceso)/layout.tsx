import type { ReactNode } from 'react';
import { Acceso } from '@/components/acceso';
import { NOMBRE_SISTEMA } from '@/lib/marca';

export default function LayoutAcceso({ children }: { children: ReactNode }) {
  return (
    <Acceso
      logo={<span className="text-lg font-medium">{NOMBRE_SISTEMA}</span>}
      nombreSistema={NOMBRE_SISTEMA}
    >
      {children}
    </Acceso>
  );
}
