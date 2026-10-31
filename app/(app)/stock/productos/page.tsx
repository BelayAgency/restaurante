import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { leerProductos } from '@/servidor/productos';
import { PantallaProductos } from './pantalla-productos';

export const metadata: Metadata = { title: 'Productos' };

// Sin loading.tsx a propósito: entre pestañas de stock queda la página anterior hasta que llega
// ésta, en vez de parpadear un esqueleto. Por eso la navegación espera al servidor.
export const instant = false;

export default async function PaginaProductos() {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'stock.administrar')) redirect('/stock');
  return <PantallaProductos productos={await leerProductos(usuario)} />;
}
