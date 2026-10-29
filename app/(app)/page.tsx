import type { Metadata } from 'next';
import { Salon } from './salon/salon';

export const metadata: Metadata = { title: 'Salón' };

export default function PaginaSalon() {
  return <Salon />;
}
