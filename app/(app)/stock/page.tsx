import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { leerStock } from '@/servidor/stock';
import { PantallaStock } from './pantalla-stock';

export const metadata: Metadata = { title: 'Stock' };

export default async function PaginaStock() {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'stock.contar')) redirect('/');
  return <PantallaStock stock={await leerStock(usuario)} />;
}
