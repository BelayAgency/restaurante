import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NavegadorPeriodo } from '@/components/periodo';
import { TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { leerPeriodo } from '@/lib/periodos';
import { usuarioDePagina } from '@/lib/sesion';
import { calcularAlertas } from '@/servidor/control';
import { ListaAlertas } from './lista-alertas';

export const metadata: Metadata = { title: 'Alertas' };

export default async function PaginaAlertas({ searchParams }: PageProps<'/control/alertas'>) {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'control.ver')) redirect('/');
  const { tipo, valor } = await searchParams;
  const periodo = leerPeriodo(typeof tipo === 'string' ? tipo : undefined, typeof valor === 'string' ? valor : undefined);
  const alertas = await calcularAlertas(periodo.desde, periodo.hasta);
  return (
    <>
      <TituloSeccion accion={<NavegadorPeriodo periodo={periodo} ruta="/control/alertas" />}>Alertas</TituloSeccion>
      <ListaAlertas alertas={alertas} />
    </>
  );
}
