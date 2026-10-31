import { CargandoFilas, Esqueleto } from '@/components/carga';
import { Tarjeta } from '@/components/ui';

export default function Cargando() {
  return (
    <>
      <Esqueleto className="mb-5 h-7 w-48" />
      <Tarjeta>
        <Esqueleto className="mb-4 h-8 w-56" />
        <CargandoFilas filas={5} />
      </Tarjeta>
    </>
  );
}
