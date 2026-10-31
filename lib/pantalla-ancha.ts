'use client';

import { useSyncExternalStore } from 'react';

function useConsultaMedia(consulta: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const lista = window.matchMedia(consulta);
      lista.addEventListener('change', avisar);
      return () => lista.removeEventListener('change', avisar);
    },
    () => window.matchMedia(consulta).matches,
    () => true,
  );
}

/**
 * Si hay lugar para paneles a los costados: 1280px o más, que con la
 * navegación a la izquierda dejan unos 1000 para el lienzo. Las pantallas que
 * son todo lienzo, como el salón, acomodan sus barras flotantes con esto.
 */
export function usePantallaAncha(): boolean {
  return useConsultaMedia('(min-width: 1280px)');
}

/** Si un modal lateral va al costado (640px o más, el corte de `.modal-lateral`) y no como hoja abajo. */
export function usePanelAlCostado(): boolean {
  return useConsultaMedia('(min-width: 640px)');
}
