import type { Metadata } from 'next';
import { PantallaCaja } from './pantalla-caja';

export const metadata: Metadata = { title: 'Caja' };

export default function PaginaCaja() {
  return <PantallaCaja />;
}
