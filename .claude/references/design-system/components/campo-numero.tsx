'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Campo de importes y cantidades, con separador de miles en vivo.
 *
 * El formato se aplica mientras se tipea y no al salir del campo: 1234567 sin
 * puntos es ilegible justo en el momento en que hay que decidir si el número
 * está bien. Lo que sube al `onChange` es el número limpio —sin puntos y con
 * punto decimal— porque lo formateado es una decoración de la vista y en la
 * base tiene que entrar un número.
 *
 * No usa `type="number"`: la rueda del mouse cambia el valor sin querer, las
 * flechas del teclado también, y el navegador no deja meterle puntos de miles.
 * Va `inputMode="decimal"`, que en el celular abre el teclado numérico igual.
 */

const SEPARADOR_MILES = '.';
const SEPARADOR_DECIMAL = ',';

/** Deja sólo dígitos y una coma decimal, y corta los decimales de más. */
export function limpiarNumero(escrito: string, decimales: number): string {
  const soloValidos = escrito.replace(/[^\d,]/g, '');
  const [entera = '', ...resto] = soloValidos.split(SEPARADOR_DECIMAL);
  if (resto.length === 0) return entera;
  return `${entera}${SEPARADOR_DECIMAL}${resto.join('').slice(0, decimales)}`;
}

/** 1234567,5 → 1.234.567,5 — sin tocar los decimales a medio escribir. */
export function conMiles(limpio: string): string {
  const [entera = '', decimal] = limpio.split(SEPARADOR_DECIMAL);
  const conPuntos = entera.replace(/\B(?=(\d{3})+(?!\d))/g, SEPARADOR_MILES);
  return decimal === undefined ? conPuntos : `${conPuntos}${SEPARADOR_DECIMAL}${decimal}`;
}

export function CampoNumero({
  etiqueta,
  valor,
  alCambiar,
  ayuda,
  error,
  decimales = 2,
  prefijo,
  placeholder = '0',
  id,
  disabled,
}: {
  etiqueta: string;
  /** Número limpio, con punto decimal: '1234567.5'. */
  valor: string;
  alCambiar: (limpio: string) => void;
  ayuda?: ReactNode;
  error?: string;
  decimales?: number;
  /** Lo que va pegado al número dentro del campo: '$', 'kg'. */
  prefijo?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  const propio = useId();
  const idCampo = id ?? propio;
  const idPie = `${idCampo}-pie`;
  const pie = error ?? ayuda;

  // Se muestra con coma; se guarda con punto.
  const mostrado = conMiles(valor.replace('.', SEPARADOR_DECIMAL));

  return (
    <div>
      <label className="etiqueta-campo" htmlFor={idCampo}>
        {etiqueta}
      </label>

      <div className="relative">
        {prefijo ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-tinta-tenue"
          >
            {prefijo}
          </span>
        ) : null}

        <input
          id={idCampo}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={mostrado}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={pie ? idPie : undefined}
          onChange={(e) => {
            const limpio = limpiarNumero(e.target.value, decimales);
            alCambiar(limpio.replace(SEPARADOR_DECIMAL, '.'));
          }}
          // Alineado a la derecha: una columna de importes se compara por la
          // unidad, no por la primera cifra.
          className={cn(
            'campo text-right tabular-nums',
            prefijo && 'pl-8',
            error && 'campo-error',
          )}
        />
      </div>

      {pie ? (
        <p id={idPie} className={cn('mt-1 text-xs', error ? 'text-error' : 'text-tinta-tenue')}>
          {pie}
        </p>
      ) : null}
    </div>
  );
}
