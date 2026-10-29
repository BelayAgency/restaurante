import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { leerCatalogo } from '@/servidor/catalogo';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { resumenDelDia } from '@/servidor/dia';
import { CierreDia } from './cierre-dia';

export const metadata: Metadata = { title: 'Cierre del día' };

export default async function PaginaCierre() {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'dia.cerrar')) redirect('/caja');
  const [resumen, catalogo] = await Promise.all([resumenDelDia(usuario), leerCatalogo()]);
  const nombres = Object.fromEntries(catalogo.operadores.map((o) => [o.id, o.nombre]));
  return <CierreDia resumen={{ ...resumen, dia: { ...resumen.dia, abiertoEn: resumen.dia.abiertoEn.toISOString(), ultimoCierre: resumen.dia.ultimoCierre?.toISOString() ?? null } }} nombres={nombres} />;
}
