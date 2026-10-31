import type { ReactNode } from 'react';
import { SubnavStock } from './subnav';

export default function LayoutStock({ children }: { children: ReactNode }) {
  return (
    // Un solo bloque: sueltos, el contenedor de la página separa con mucho aire
    // el título de lo que tiene debajo. Acá alcanza con el margen de cada uno.
    <div>
      <SubnavStock />
      {children}
    </div>
  );
}
