'use client';

import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useEstadoSync } from './motor-sync';

/** Tapa la app hasta que el dispositivo tiene sus datos locales: la primera vez, después de entrar. */
export function EsperaSync({ children }: { children: ReactNode }) {
  const { listo } = useEstadoSync();
  if (listo) return children;
  return (
    <div className="grid min-h-dvh place-items-center bg-lienzo" role="status" aria-label="Cargando">
      <LoaderCircle size={32} strokeWidth={1.75} className="animate-spin text-acento motion-reduce:animate-none" />
    </div>
  );
}
