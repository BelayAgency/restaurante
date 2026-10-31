'use client';

import { useSyncExternalStore } from 'react';

/**
 * El canvas no entiende `var(--color-…)`: hay que leer el valor ya resuelto.
 * Se vuelve a leer cuando cambia la clase `.dark` de la raíz, que es como
 * conmuta el tema el sistema de diseño.
 */

const TOKENS = [
  'lienzo',
  'superficie',
  'elevada',
  'perilla',
  'borde',
  'borde-fuerte',
  'tinta',
  'tinta-suave',
  'tinta-tenue',
  'acento',
  'acento-tenue',
  'exito',
  'exito-tenue',
  'alerta',
  'alerta-tenue',
  'error',
  'error-tenue',
] as const;

export type TokenColor = (typeof TOKENS)[number];
export type ColoresTema = Record<TokenColor, string>;

let ultimaClave = '';
let ultimos: ColoresTema | null = null;

function leer(): ColoresTema {
  const estilo = getComputedStyle(document.documentElement);
  const valores = TOKENS.map((t) => estilo.getPropertyValue(`--color-${t}`).trim());
  const clave = valores.join('|');
  // useSyncExternalStore exige la misma referencia mientras nada cambió.
  if (clave !== ultimaClave || !ultimos) {
    ultimaClave = clave;
    ultimos = Object.fromEntries(TOKENS.map((t, i) => [t, valores[i]])) as ColoresTema;
  }
  return ultimos;
}

function suscribir(avisar: () => void) {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observador.disconnect();
}

export function useColoresTema(): ColoresTema | null {
  return useSyncExternalStore(suscribir, leer, () => null);
}
