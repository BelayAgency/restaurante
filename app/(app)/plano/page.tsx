import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { leerPlano } from '@/servidor/plano';
import { EditorPlano } from './editor-plano';

export const metadata: Metadata = { title: 'Plano del salón' };

export default async function PaginaPlano() {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'plano.administrar')) redirect('/');
  const plano = await leerPlano(usuario);
  return <EditorPlano inicial={plano} />;
}
