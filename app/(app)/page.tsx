import type { Metadata } from 'next';
import { diaLocal } from '@/dominio/reservas';
import { usuarioDePagina } from '@/lib/sesion';
import { leerPendientesDeHoy } from '@/servidor/reservas';
import { Salon } from './salon/salon';

export const metadata: Metadata = { title: 'Salón' };

export default async function PaginaSalon() {
  const usuario = await usuarioDePagina();
  // El salón opera igual sin las reservas: si no se pueden leer, se sigue sin ellas.
  const reservasHoy = await leerPendientesDeHoy(usuario, diaLocal()).catch((error: unknown) => {
    console.error('[salon] no se pudieron leer las reservas', error);
    return [];
  });
  return <Salon reservasHoy={reservasHoy} />;
}
