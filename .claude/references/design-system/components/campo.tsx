'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Campo de texto con su etiqueta, su ayuda y su error.
 *
 * Los tres van atados al input por id y no sólo puestos al lado: la etiqueta
 * con `htmlFor` —así apretarla enfoca el campo, que en un celular es la
 * diferencia entre acertarle y no—, y la ayuda o el error con
 * `aria-describedby`, para que el lector de pantalla los diga al entrar al
 * campo en vez de dejarlos como texto suelto que nunca se anuncia.
 *
 * El error reemplaza a la ayuda en vez de sumarse: son el mismo renglón, y
 * apilarlos mueve el formulario entero cada vez que algo se valida.
 */
export function Campo({
  etiqueta,
  ayuda,
  error,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string;
  ayuda?: ReactNode;
  error?: string;
}) {
  const propio = useId();
  const idCampo = id ?? propio;
  const idPie = `${idCampo}-pie`;
  const pie = error ?? ayuda;

  return (
    <div>
      <label className="etiqueta-campo" htmlFor={idCampo}>
        {etiqueta}
      </label>
      <input
        {...props}
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={pie ? idPie : undefined}
        className={cn('campo', error && 'campo-error', className)}
      />
      {pie ? (
        <p id={idPie} className={cn('mt-1 text-xs', error ? 'text-error' : 'text-tinta-tenue')}>
          {pie}
        </p>
      ) : null}
    </div>
  );
}
