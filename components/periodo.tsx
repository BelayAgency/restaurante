import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cambiarTipo, correr, yaEmpezo, type Periodo } from '@/lib/periodos';
import { cn } from '@/lib/cn';
import { SelectorPeriodo } from './selector-periodo';

/**
 * Moverse entre períodos y mostrar sus cifras.
 *
 * Sin `'use client'` a propósito: las flechas y los valores de cada lupa se
 * calculan en el servidor, que es quien sabe qué día es hoy. Calcularlos en el
 * navegador puede dar otro día que el servidor cerca de la medianoche, y ahí
 * la flecha de «siguiente» aparece en un render y desaparece en el otro.
 *
 * La lógica de fechas vive pura y probada en `lib/periodos.ts`; esto sólo la
 * dibuja. Ver `ejemplos/balance-periodo.tsx` para la pantalla armada.
 */

/**
 * Las flechas y el nombre del período, arriba a la derecha de la tarjeta.
 *
 * Las flechas son enlaces: el período vive en la URL, así que moverse es
 * navegar. Funciona el atrás del navegador, se puede compartir el enlace de un
 * mes puntual y no hace falta JavaScript para cambiar de período.
 *
 * Hacia adelante se corta en el período corriente: el mes que viene todavía no
 * pasó, y dejar entrar ahí sólo lleva a pantallas vacías que no dicen nada. La
 * flecha no desaparece —se atenúa— para que el nombre no se corra de lugar.
 */
export function NavegadorPeriodo({ periodo, ruta }: { periodo: Periodo; ruta: string }) {
  const anterior = correr(periodo, -1);
  const siguiente = correr(periodo, 1);
  const haySiguiente = yaEmpezo(siguiente, periodo.tipo);

  const flecha =
    'rounded-lg p-1.5 text-tinta-tenue transition-colors hover:bg-lienzo hover:text-tinta';
  const enlace = (valor: string) => `${ruta}?tipo=${periodo.tipo}&valor=${valor}`;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link href={enlace(anterior)} className={flecha} aria-label="Ir al período anterior">
        <ChevronLeft size={16} strokeWidth={1.5} />
      </Link>

      <SelectorPeriodo
        ruta={ruta}
        etiqueta={periodo.etiqueta}
        tipo={periodo.tipo}
        valores={{
          semana: cambiarTipo(periodo, 'semana'),
          mes: cambiarTipo(periodo, 'mes'),
          anio: cambiarTipo(periodo, 'anio'),
          rango: cambiarTipo(periodo, 'rango'),
        }}
        desde={periodo.desde}
        hasta={periodo.hasta}
      />

      {haySiguiente ? (
        <Link href={enlace(siguiente)} className={flecha} aria-label="Ir al período siguiente">
          <ChevronRight size={16} strokeWidth={1.5} />
        </Link>
      ) : (
        <span className={cn(flecha, 'opacity-30 hover:bg-transparent hover:text-tinta-tenue')} aria-hidden>
          <ChevronRight size={16} strokeWidth={1.5} />
        </span>
      )}
    </div>
  );
}

/**
 * Una de las cifras del período. Sin caja propia: ya está adentro de una
 * tarjeta, y una tarjeta dentro de otra es ruido. El fondo `bg-lienzo` alcanza
 * para separarla.
 *
 * `tono` es una clase de color por token (`text-tinta`, `text-exito`,
 * `text-error`), nunca un hex. Sólo la cifra que es LA respuesta lleva color;
 * ver el comentario de `ejemplos/balance-periodo.tsx`.
 */
export function CifraPeriodo({
  etiqueta,
  valor,
  tono = 'text-tinta',
}: {
  etiqueta: string;
  valor: string;
  tono?: string;
}) {
  return (
    <div className="rounded-xl bg-lienzo px-4 py-3">
      <p className="text-sm text-tinta-tenue">{etiqueta}</p>
      <p className={cn('mt-0.5 text-xl font-semibold tabular-nums', tono)}>{valor}</p>
    </div>
  );
}

/** Cómo se nombra el período cuando hay que hablar de él en una frase. */
export const ESTE_PERIODO: Record<Periodo['tipo'], string> = {
  semana: 'esta semana',
  mes: 'este mes',
  anio: 'este año',
  rango: 'este rango',
};
