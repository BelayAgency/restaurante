import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CargandoFilas } from '@/components/carga';
import { Tarjeta, TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { usuarioDePagina } from '@/lib/sesion';
import { listarDispositivos } from '@/servidor/sync';
import { EsteDispositivo } from './este-dispositivo';
import { TablaDispositivos } from './tabla-dispositivos';

export const metadata: Metadata = { title: 'Este dispositivo' };

async function Dispositivos() {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'dispositivos.administrar')) return null;
  const filas = await listarDispositivos(usuario);
  return (
    <section className="mt-8">
      <TituloSeccion descripcion="Un dispositivo dado de baja deja de sincronizar; lo que ya cargó queda.">Dispositivos registrados</TituloSeccion>
      <TablaDispositivos
        dispositivos={filas.map((d) => ({
          id: d.id,
          nombre: d.nombre,
          ultimoContacto: d.ultimoContacto?.toISOString() ?? null,
          desfaseRelojMs: d.desfaseRelojMs,
          revocado: d.revocadoEn !== null,
        }))}
      />
    </section>
  );
}

export default function PaginaDispositivo() {
  return (
    <>
      <TituloSeccion>Este dispositivo</TituloSeccion>
      <EsteDispositivo />
      <Suspense
        fallback={
          <Tarjeta className="mt-8">
            <CargandoFilas filas={3} />
          </Tarjeta>
        }
      >
        <Dispositivos />
      </Suspense>
    </>
  );
}
