import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CifraPeriodo, NavegadorPeriodo } from '@/components/periodo';
import { EstadoVacio, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { formatearCantidad } from '@/dominio/stock';
import { pesosDesdeCentavos } from '@/lib/formato';
import { leerPeriodo } from '@/lib/periodos';
import { usuarioDePagina } from '@/lib/sesion';
import { diferenciasDeStock } from '@/servidor/stock';

export const metadata: Metadata = { title: 'Teórico vs. real' };

const RUTA = '/stock/diferencias';

function pesos(centavos: number) {
  return pesosDesdeCentavos(Math.round(centavos));
}

/**
 * El reporte central: lo que las recetas dicen que se vendió, lo que se dio de
 * baja con nombre y lo que faltó en los conteos sin explicación. La última
 * columna es la plata que el dueño no encuentra.
 */
export default async function PaginaDiferencias({ searchParams }: PageProps<'/stock/diferencias'>) {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'stock.administrar')) redirect('/stock');
  const { tipo, valor } = await searchParams;
  const periodo = leerPeriodo(typeof tipo === 'string' ? tipo : undefined, typeof valor === 'string' ? valor : undefined);
  const filas = await diferenciasDeStock(usuario, periodo.desde, periodo.hasta);

  const teorico = filas.reduce((s, f) => s + f.valorTeorico, 0);
  const bajas = filas.reduce((s, f) => s + f.valorBajas, 0);
  // Positivo es faltante: el conteo encontró menos de lo que debía haber.
  const faltante = filas.reduce((s, f) => s + f.valorFaltante, 0);

  return (
    <>
      <TituloSeccion accion={<NavegadorPeriodo periodo={periodo} ruta={RUTA} />}>Teórico vs. real</TituloSeccion>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <CifraPeriodo etiqueta="Consumo según recetas" valor={pesos(teorico)} />
        <CifraPeriodo etiqueta="Mermas, vencimientos y personal" valor={pesos(bajas)} />
        <CifraPeriodo
          etiqueta={faltante >= 0 ? 'Faltante sin explicar' : 'Sobrante en conteos'}
          valor={pesos(Math.abs(faltante))}
          tono={Math.abs(faltante) < 1 ? 'text-tinta' : faltante > 0 ? 'text-error' : 'text-alerta'}
        />
      </div>

      <Tarjeta>
        {filas.length === 0 ? (
          <EstadoVacio titulo="No hubo movimientos de stock en este período" />
        ) : (
          <div className="overflow-x-auto">
            <Tabla>
              <thead>
                <tr>
                  <Th>Insumo</Th>
                  <Th className="text-right">Según recetas</Th>
                  <Th className="text-right">Bajas</Th>
                  <Th className="text-right">Faltante</Th>
                  <Th className="text-right">En plata</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.insumoId}>
                    <Td className="font-medium">{f.nombre}</Td>
                    <Td className="text-right tabular-nums text-tinta-suave">{f.teorico ? formatearCantidad(f.teorico, f.unidad) : '—'}</Td>
                    <Td className="text-right tabular-nums text-tinta-suave">{f.bajas ? formatearCantidad(f.bajas, f.unidad) : '—'}</Td>
                    <Td className={f.faltante > 0 ? 'text-right tabular-nums text-error' : 'text-right tabular-nums'}>
                      {Math.abs(f.faltante) > 0.0001 ? formatearCantidad(f.faltante, f.unidad) : '—'}
                    </Td>
                    <Td className="text-right tabular-nums">{Math.abs(f.valorFaltante) >= 1 ? pesos(f.valorFaltante) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
