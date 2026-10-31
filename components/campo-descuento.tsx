'use client';

import { cn } from '@/lib/cn';
import { NumeroInline } from './numero-inline';

export type ModoDescuento = 'porcentaje' | 'monto';

/**
 * Un descuento en porcentaje o en pesos: el número y, pegado a la derecha, un
 * par de botones que funcionan como uno solo para elegir la unidad. Cambiar de
 * unidad vacía el número: 10 % y $ 10 no son lo mismo.
 */
export function CampoDescuento({
  etiqueta = 'Descuento',
  valor,
  alCambiar,
  modo,
  alCambiarModo,
}: {
  etiqueta?: string;
  valor: string;
  alCambiar: (limpio: string) => void;
  modo: ModoDescuento;
  alCambiarModo: (modo: ModoDescuento) => void;
}) {
  const opcion = (m: ModoDescuento, texto: string, nombre: string) => (
    <button
      type="button"
      aria-pressed={modo === m}
      aria-label={nombre}
      onClick={() => {
        if (modo === m) return;
        alCambiarModo(m);
        alCambiar('');
      }}
      className={cn(
        'h-full w-11 cursor-pointer border-0 text-sm font-semibold transition-colors',
        modo === m ? 'bg-acento text-perilla' : 'bg-transparent text-tinta-suave hover:bg-fill-fantasma-hover hover:text-tinta',
      )}
    >
      {texto}
    </button>
  );

  return (
    <div>
      <p className="etiqueta-campo">{etiqueta}</p>
      <div className="flex h-10 items-stretch gap-2">
        <NumeroInline etiqueta={etiqueta} valor={valor} alCambiar={alCambiar} decimales={modo === 'porcentaje' ? 1 : 2} className="h-full min-w-0 flex-1" />
        <div role="group" aria-label="Unidad del descuento" className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-inset ring-borde-fuerte">
          {opcion('porcentaje', '%', 'En porcentaje')}
          <span aria-hidden="true" className="w-px bg-borde-fuerte" />
          {opcion('monto', '$', 'En pesos')}
        </div>
      </div>
    </div>
  );
}
