import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { listarUsuarios } from '@/servidor/usuarios';
import { GestionUsuarios } from './gestion-usuarios';

export const metadata: Metadata = { title: 'Usuarios' };

export default async function PaginaUsuarios() {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'usuarios.ver')) redirect('/');
  return <GestionUsuarios usuarios={await listarUsuarios(usuario)} />;
}
