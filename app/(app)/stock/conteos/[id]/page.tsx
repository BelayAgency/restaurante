import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { leerConteo } from '@/servidor/stock';
import { CargaConteo } from './carga-conteo';

export const metadata: Metadata = { title: 'Conteo' };

export default async function PaginaConteo({ params }: PageProps<'/stock/conteos/[id]'>) {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'stock.contar')) redirect('/');
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  return <CargaConteo conteo={await leerConteo(usuario, id.data)} />;
}
