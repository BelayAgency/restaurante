'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Las seis casillas del código.
 *
 * Una por dígito y no un campo largo: el código llega por mail y se copia o se
 * tipea mirando otra pantalla, así que cada dígito tiene que verse llegar a su
 * lugar. El foco avanza solo, el borrado retrocede, y pegar los seis de una
 * vez los reparte — que es lo que hace todo el mundo.
 *
 * El valor sigue siendo un string de seis caracteres hacia afuera: quien lo usa
 * no se entera de que adentro son seis inputs.
 */

const LARGO = 6;

export function CampoCodigo({
  valor,
  alCambiar,
  alCompletar,
  deshabilitado,
}: {
  valor: string;
  alCambiar: (v: string) => void;
  /** Se dispara cuando entra el sexto dígito, para no obligar a apretar. */
  alCompletar?: (v: string) => void;
  deshabilitado?: boolean;
}) {
  const casillas = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    casillas.current[0]?.focus();
  }, []);

  const digitos = valor.padEnd(LARGO, ' ').slice(0, LARGO).split('');

  function escribir(indice: number, entrada: string): void {
    const soloNumeros = entrada.replace(/\D/g, '');
    if (!soloNumeros) return;

    // Pegar el código entero desde cualquier casilla lo reparte desde ahí.
    const actual = valor.padEnd(LARGO, ' ').split('');
    for (let i = 0; i < soloNumeros.length && indice + i < LARGO; i++) {
      actual[indice + i] = soloNumeros[i]!;
    }

    const nuevo = actual.join('').trimEnd();
    alCambiar(nuevo);

    const siguiente = Math.min(indice + soloNumeros.length, LARGO - 1);
    casillas.current[siguiente]?.focus();

    if (nuevo.replace(/\s/g, '').length === LARGO) alCompletar?.(nuevo);
  }

  function teclear(indice: number, e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const actual = valor.padEnd(LARGO, ' ').split('');

      // Si la casilla ya está vacía, el borrado se lleva la anterior: es lo que
      // uno espera cuando erró un dígito y viene retrocediendo.
      if (actual[indice] === ' ' && indice > 0) {
        actual[indice - 1] = ' ';
        casillas.current[indice - 1]?.focus();
      } else {
        actual[indice] = ' ';
      }
      alCambiar(actual.join('').trimEnd());
      return;
    }

    if (e.key === 'ArrowLeft' && indice > 0) casillas.current[indice - 1]?.focus();
    if (e.key === 'ArrowRight' && indice < LARGO - 1) casillas.current[indice + 1]?.focus();
  }

  return (
    <div className="flex justify-center gap-1.5 sm:gap-2" role="group" aria-label="Código de seis dígitos">
      {digitos.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            casillas.current[i] = el;
          }}
          value={d.trim()}
          onChange={(e) => escribir(i, e.target.value)}
          onKeyDown={(e) => teclear(i, e)}
          onFocus={(e) => e.target.select()}
          disabled={deshabilitado}
          inputMode="numeric"
          /*
           * En TODAS las casillas, no sólo en la primera.
           *
           * Es lo que le dice al teclado de iOS que ofrezca el código que
           * acaba de llegar al mail. Con `off` en las otras cinco, la
           * sugerencia llenaba una casilla y dejaba las demás vacías, que es
           * peor que no ofrecer nada.
           */
          autoComplete="one-time-code"
          aria-label={`Dígito ${i + 1}`}
          className={cn(
            'h-12 w-9 rounded-xl bg-lienzo text-center font-mono text-lg text-tinta sm:h-14 sm:w-11 sm:text-xl',
            'shadow-[var(--sombra-tarjeta)] outline-none transition',
            'focus:ring-2 focus:ring-acento disabled:opacity-50',
          )}
        />
      ))}
    </div>
  );
}
