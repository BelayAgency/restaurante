import type { Metadata } from 'next';
import { LayoutGrid } from 'lucide-react';
import { EstadoVacio, Tarjeta, TituloSeccion } from '@/components/ui';

export const metadata: Metadata = { title: 'Salón' };

export default function PaginaSalon() {
  return (
    <>
      <TituloSeccion>Salón</TituloSeccion>
      <Tarjeta>
        <EstadoVacio
          icono={<LayoutGrid size={28} strokeWidth={1.5} />}
          titulo="Todavía no hay un plano del salón"
          detalle="El plano y la operación de mesas llegan en la fase 2."
        />
      </Tarjeta>
    </>
  );
}
