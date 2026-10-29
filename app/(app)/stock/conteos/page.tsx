import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { leerStock, listarConteos } from '@/servidor/stock';
import { PantallaConteos } from './pantalla-conteos';

export const metadata: Metadata = { title: 'Conteos' };

export default async function PaginaConteos() {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'stock.contar')) redirect('/');
  const [conteos, stock] = await Promise.all([listarConteos(usuario), leerStock(usuario)]);
  return (
    <PantallaConteos
      conteos={conteos.map((c) => ({ ...c, abiertoEn: c.abiertoEn.toISOString(), cerradoEn: c.cerradoEn?.toISOString() ?? null }))}
      stock={stock}
    />
  );
}
