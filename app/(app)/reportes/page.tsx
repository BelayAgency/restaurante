import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import { BotonEnlace } from '@/components/boton';
import { NavegadorPeriodo } from '@/components/periodo';
import { TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { leerPeriodo } from '@/lib/periodos';
import { usuarioDePagina } from '@/lib/sesion';
import { cajasDelPeriodo, gastosDelPeriodo, reporteDeCompras, reporteDeVentas, valorizacionDeStock } from '@/servidor/reportes';
import { TarjetaBalance } from './tarjeta-balance';
import { PantallaReportes } from './pantalla-reportes';

export const metadata: Metadata = { title: 'Reportes' };

export default async function PaginaReportes({ searchParams }: PageProps<'/reportes'>) {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'reportes.ver')) redirect('/');
  const { tipo, valor } = await searchParams;
  const periodo = leerPeriodo(typeof tipo === 'string' ? tipo : undefined, typeof valor === 'string' ? valor : undefined);
  const [ventas, compras, stock, gastos, cajas] = await Promise.all([
    reporteDeVentas(usuario, periodo.desde, periodo.hasta),
    reporteDeCompras(usuario, periodo.desde, periodo.hasta),
    valorizacionDeStock(usuario),
    gastosDelPeriodo(usuario, periodo.desde, periodo.hasta),
    cajasDelPeriodo(usuario, periodo.desde, periodo.hasta),
  ]);
  const consultaPeriodo = new URLSearchParams({ tipo: periodo.tipo, valor: periodo.valor }).toString();
  return (
    // Un solo bloque: sueltos, el contenedor de la página separa cada tarjeta con mucho aire.
    <div>
      <TituloSeccion
        accion={
          <div className="flex items-center gap-2">
            <BotonEnlace href={`/api/reportes/exportar?formato=pdf&${consultaPeriodo}`} descargar>
              <FileText size={15} strokeWidth={1.5} /> <span className="max-sm:sr-only">Exportar PDF</span>
            </BotonEnlace>
            <NavegadorPeriodo periodo={periodo} ruta="/reportes" />
          </div>
        }
      >
        Reportes
      </TituloSeccion>
      <TarjetaBalance ventasCentavos={ventas.resumen.ventasCentavos} {...gastos} />
      <PantallaReportes ventas={ventas} compras={compras} stock={stock} cajas={cajas} />
    </div>
  );
}
