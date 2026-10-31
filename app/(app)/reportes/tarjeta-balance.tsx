import { CifraPeriodo } from '@/components/periodo';
import { Tarjeta } from '@/components/ui';
import { pesosDesdeCentavos } from '@/lib/formato';

/**
 * El resultado del período con lo que pasa por el sistema: lo cobrado (sin
 * propinas, que son del personal) menos las compras y los egresos de caja.
 * Sueldos, alquiler o servicios que se paguen por fuera no están: el número
 * es tan completo como lo que se registra.
 */
export function TarjetaBalance({ ventasCentavos, comprasCentavos, egresosCentavos }: { ventasCentavos: number; comprasCentavos: number; egresosCentavos: number }) {
  const gastosCentavos = comprasCentavos + egresosCentavos;
  const resultado = ventasCentavos - gastosCentavos;
  const margen = ventasCentavos > 0 ? Math.round((resultado / ventasCentavos) * 100) : null;

  return (
    <Tarjeta className="mb-4">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-tinta">Balance</h2>
        {margen !== null ? <p className="text-sm tabular-nums text-tinta-tenue">Margen {margen}%</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <CifraPeriodo etiqueta="Ventas" valor={pesosDesdeCentavos(ventasCentavos)} />
        <CifraPeriodo etiqueta="Costos" valor={pesosDesdeCentavos(gastosCentavos)} />
        <CifraPeriodo etiqueta="Ganancia" valor={pesosDesdeCentavos(resultado)} tono={resultado > 0 ? 'text-exito' : resultado < 0 ? 'text-error' : 'text-tinta'} />
      </div>
      <p className="mt-3 text-sm tabular-nums text-tinta-tenue">
        Compras a proveedores {pesosDesdeCentavos(comprasCentavos)} · Egresos de caja {pesosDesdeCentavos(egresosCentavos)}
      </p>
    </Tarjeta>
  );
}
