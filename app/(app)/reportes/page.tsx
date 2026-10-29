import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NavegadorPeriodo } from '@/components/periodo';
import { TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { leerPeriodo } from '@/lib/periodos';
import { usuarioDePagina } from '@/lib/sesion';
import { reporteDeCompras, reporteDeVentas, valorizacionDeStock } from '@/servidor/reportes';
import { PantallaReportes } from './pantalla-reportes';

export const metadata: Metadata = { title: 'Reportes' };

export default async function PaginaReportes({ searchParams }: PageProps<'/reportes'>) {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'reportes.ver')) redirect('/');
  const { tipo, valor } = await searchParams;
  const periodo = leerPeriodo(typeof tipo === 'string' ? tipo : undefined, typeof valor === 'string' ? valor : undefined);
  const [ventas, compras, stock] = await Promise.all([
    reporteDeVentas(usuario, periodo.desde, periodo.hasta),
    reporteDeCompras(usuario, periodo.desde, periodo.hasta),
    valorizacionDeStock(usuario),
  ]);
  return (
    <>
      <TituloSeccion accion={<NavegadorPeriodo periodo={periodo} ruta="/reportes" />}>Reportes</TituloSeccion>
      <PantallaReportes
        ventas={ventas}
        compras={compras}
        stock={stock}
        consultaPeriodo={new URLSearchParams({ tipo: periodo.tipo, valor: periodo.valor }).toString()}
      />
    </>
  );
}
