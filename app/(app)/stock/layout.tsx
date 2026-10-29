import type { ReactNode } from 'react';
import { SubnavStock } from './subnav';

export default function LayoutStock({ children }: { children: ReactNode }) {
  return (
    <>
      <SubnavStock />
      {children}
    </>
  );
}
