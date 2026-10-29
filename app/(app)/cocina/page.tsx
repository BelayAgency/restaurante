import type { Metadata } from 'next';
import { PantallaCocina } from './pantalla-cocina';

export const metadata: Metadata = { title: 'Cocina' };

export default function PaginaCocina() {
  return <PantallaCocina />;
}
