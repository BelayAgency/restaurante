import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { leerRecetas } from '@/servidor/stock';
import { PantallaRecetas } from './pantalla-recetas';

export const metadata: Metadata = { title: 'Recetas' };

export default async function PaginaRecetas() {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'stock.administrar')) redirect('/stock');
  return <PantallaRecetas recetas={await leerRecetas(usuario)} />;
}
