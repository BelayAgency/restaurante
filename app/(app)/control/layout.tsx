import type { ReactNode } from 'react';
import { SubnavControl } from './subnav';

export default function LayoutControl({ children }: { children: ReactNode }) {
  return (
    <>
      <SubnavControl />
      {children}
    </>
  );
}
