import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { puede } from '@/dominio/permisos';
import { diaLocal, fechaReserva } from '@/dominio/reservas';
import { usuarioDePagina } from '@/lib/sesion';
import { leerReservasDelDia } from '@/servidor/reservas';
import { PantallaReservas } from './pantalla-reservas';

export const metadata: Metadata = { title: 'Reservas' };

export default async function PaginaReservas({ searchParams }: PageProps<'/reservas'>) {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'reservas.operar')) redirect('/');
  // Un día inválido en la dirección cae en hoy en vez de romper.
  const pedido = fechaReserva.safeParse((await searchParams).dia);
  const dia = pedido.success ? pedido.data : diaLocal();
  return <PantallaReservas key={dia} dia={dia} reservas={await leerReservasDelDia(usuario, dia)} />;
}
