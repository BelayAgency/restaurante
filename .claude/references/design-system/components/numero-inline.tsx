'use client';

import { cn } from '@/lib/cn';
import { conMiles, limpiarNumero } from './campo-numero';

/* Cantidad editable dentro de una fila (items de un pedido, recibido de una
   entrega): mismo formato en vivo que CampoNumero, pero sin etiqueta visible —
   la fila ya dice de qué producto se trata, y el nombre accesible va en
   aria-label. */
export function NumeroInline({
  valor,
  alCambiar,
  etiqueta,
  decimales = 3,
  className,
}: {
  /** Número limpio, con punto decimal. */
  valor: string;
  alCambiar: (limpio: string) => void;
  /** Nombre accesible del campo. */
  etiqueta: string;
  decimales?: number;
  className?: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={etiqueta}
      value={conMiles(valor.replace('.', ','))}
      onChange={(e) =>
        alCambiar(limpiarNumero(e.target.value, decimales).replace(',', '.'))
      }
      placeholder="0"
      className={cn('campo text-right tabular-nums', className)}
    />
  );
}
