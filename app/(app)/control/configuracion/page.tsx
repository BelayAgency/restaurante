import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { leerConfiguracionControl } from '@/servidor/control';
import { EditorControl } from './editor-control';

export const metadata: Metadata = { title: 'Configuración de control' };

export default async function PaginaConfiguracionControl() {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'control.configurar')) redirect('/control');
  return <EditorControl inicial={await leerConfiguracionControl(usuario)} />;
}
