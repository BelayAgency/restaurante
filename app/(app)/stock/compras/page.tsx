import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { leerStock, listarCompras } from '@/servidor/stock';
import { PantallaCompras } from './pantalla-compras';

export const metadata: Metadata = { title: 'Compras' };

export default async function PaginaCompras() {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'stock.administrar')) redirect('/stock');
  const [compras, stock] = await Promise.all([listarCompras(usuario), leerStock(usuario)]);
  return <PantallaCompras compras={compras} stock={stock} />;
}
