'use client';

import { useSyncExternalStore } from 'react';

// Un solo reloj para toda la página: cada mesa que muestra "hace 12 min" lee
// el mismo valor en vez de tener su propio intervalo.
let ahora = Date.now();
const oyentes = new Set<() => void>();
let reloj: ReturnType<typeof setInterval> | null = null;

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  reloj ??= setInterval(() => {
    ahora = Date.now();
    for (const o of oyentes) o();
  }, 30_000);
  return () => {
    oyentes.delete(avisar);
    if (oyentes.size === 0 && reloj) {
      clearInterval(reloj);
      reloj = null;
    }
  };
}

export function useAhora(): number {
  return useSyncExternalStore(
    suscribir,
    () => ahora,
    () => 0,
  );
}

export function minutosDesde(iso: string, momento: number): number {
  return Math.max(0, Math.floor((momento - new Date(iso).getTime()) / 60_000));
}

export function duracionCorta(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')}`;
}
