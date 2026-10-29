import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { listarCarta } from '@/servidor/carta';
import { AdministrarCarta } from './administrar-carta';

export const metadata: Metadata = { title: 'Carta' };

export default async function PaginaCarta({ searchParams }: PageProps<'/carta'>) {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'carta.administrar')) redirect('/');
  const parametros = await searchParams;
  const busqueda = typeof parametros.buscar === 'string' ? parametros.buscar.trim().slice(0, 80) : '';
  const categoria = z.uuid().safeParse(parametros.categoria);
  const carta = await listarCarta(usuario, { busqueda: busqueda || undefined, categoriaId: categoria.success ? categoria.data : undefined });
  return <AdministrarCarta carta={carta} busqueda={busqueda} categoriaFiltro={categoria.success ? categoria.data : undefined} />;
}
