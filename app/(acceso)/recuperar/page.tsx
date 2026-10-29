import type { Metadata } from 'next';
import { FlujoRecuperar } from './flujo-recuperar';

export const metadata: Metadata = { title: 'Recuperar el acceso' };

export default function PaginaRecuperar() {
  return <FlujoRecuperar />;
}
