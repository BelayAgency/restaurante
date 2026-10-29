import { CargandoFilas, Esqueleto } from '@/components/carga';
import { Tarjeta } from '@/components/ui';

export default function Cargando() {
  return (
    <>
      <Esqueleto className="mb-5 h-7 w-48" />
      <Tarjeta>
        <CargandoFilas filas={5} />
      </Tarjeta>
    </>
  );
}
