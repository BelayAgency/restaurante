'use client';

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

/**
 * Pestañas con fondo deslizante: al cambiar de una a otra, el fondo de la
 * activa se DESPLAZA hasta la nueva —no se apaga en una y se prende en la
 * otra— y de paso toma su ancho. Es lo que hace que el cambio se lea como un
 * solo gesto y no como dos parpadeos.
 *
 * Cómo se ve: una barra `bg-lienzo` redondeada con las pestañas adentro; la
 * activa lleva encima un fondo `bg-superficie` con `shadow-sutil` y un borde leve (`ring-1 ring-borde-fuerte`, que no ocupa espacio), y es ESE
 * fondo el que se mueve. El texto de cada pestaña va por encima (`z-10`) y sólo
 * cambia de color; no se mueve nada más que el fondo.
 *
 * Cómo funciona: el fondo es un único elemento absoluto, posicionado con
 * `transform: translateX()` y `width` medidos del botón activo. Animar
 * `transform` y `width` (y no `left`) evita recalcular el layout en cada cuadro.
 *
 * Detalles que importan:
 * - La primera medición NO se anima: sin eso, el fondo entra volando desde el
 *   borde izquierdo al cargar la pantalla.
 * - Se vuelve a medir con `ResizeObserver` cuando cambia el ancho de la barra
 *   (rotar el celular, abrir/cerrar la navegación lateral); si no, el fondo
 *   queda desfasado del botón.
 * - `prefers-reduced-motion`: el fondo salta sin transición.
 * - Teclado: flechas izquierda/derecha, Inicio y Fin mueven y activan
 *   (activación automática: son pestañas de contenido liviano, no formularios).
 *
 * Es controlado: el padre guarda `valor`. Para que la pestaña viva en la URL
 * (`?tab=...`, como el período), el padre llama a `router.replace` en
 * `alCambiar` y lee el valor de `searchParams`.
 */

export interface OpcionTab {
  valor: string;
  etiqueta: string;
  /** Un ícono Lucide de 14px, opcional. */
  icono?: ReactNode;
  /** Un contador o insignia a la derecha de la etiqueta. */
  detalle?: ReactNode;
  deshabilitada?: boolean;
}

export function Tabs({
  opciones,
  valor,
  alCambiar,
  etiqueta,
  className,
  ancho,
  parejas,
}: {
  opciones: OpcionTab[];
  valor: string;
  alCambiar: (valor: string) => void;
  /** Nombre accesible de la barra: «Secciones de facturación». */
  etiqueta: string;
  className?: string;
  /** Reparte el ancho en partes iguales, en vez de ajustarse al texto. */
  ancho?: boolean;
  /**
   * Todas del ancho de la más larga, sin ocupar toda la fila: así el fondo
   * activo no se estira y se encoge al pasar entre etiquetas muy distintas.
   */
  parejas?: boolean;
}) {
  const id = useId();
  const barra = useRef<HTMLDivElement>(null);
  const botones = useRef(new Map<string, HTMLButtonElement>());
  const [fondo, setFondo] = useState<{ x: number; ancho: number } | null>(null);
  // Se prende recién después de la primera medición, para que ésa no se anime.
  const [animar, setAnimar] = useState(false);

  const medir = useCallback(() => {
    const activo = botones.current.get(valor);
    if (!activo) return;
    setFondo({ x: activo.offsetLeft, ancho: activo.offsetWidth });
  }, [valor]);

  useLayoutEffect(() => {
    medir();
  }, [medir, opciones]);

  useLayoutEffect(() => {
    if (fondo && !animar) {
      // Un cuadro después de pintar la posición inicial.
      const cuadro = requestAnimationFrame(() => setAnimar(true));
      return () => cancelAnimationFrame(cuadro);
    }
  }, [fondo, animar]);

  useLayoutEffect(() => {
    if (!barra.current) return;
    const observador = new ResizeObserver(medir);
    observador.observe(barra.current);
    return () => observador.disconnect();
  }, [medir]);

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    const habilitadas = opciones.filter((o) => !o.deshabilitada);
    const actual = habilitadas.findIndex((o) => o.valor === valor);
    let destino: number | null = null;

    if (e.key === 'ArrowRight') destino = (actual + 1) % habilitadas.length;
    else if (e.key === 'ArrowLeft') destino = (actual - 1 + habilitadas.length) % habilitadas.length;
    else if (e.key === 'Home') destino = 0;
    else if (e.key === 'End') destino = habilitadas.length - 1;

    if (destino === null) return;
    e.preventDefault();
    const siguiente = habilitadas[destino];
    if (!siguiente) return;
    alCambiar(siguiente.valor);
    botones.current.get(siguiente.valor)?.focus();
  }

  return (
    <div
      ref={barra}
      role="tablist"
      aria-label={etiqueta}
      onKeyDown={alTeclear}
      className={cn(
        // El anillo hace visible la barra también sobre el fondo de la página, que es del mismo `lienzo`.
        'relative inline-flex items-center gap-0.5 rounded-xl bg-lienzo p-1 ring-1 ring-inset ring-borde',
        ancho && 'flex w-full',
        parejas && 'inline-grid auto-cols-fr grid-flow-col',
        className,
      )}
    >
      {/* El fondo que se desplaza. Detrás del texto, delante de la barra. */}
      {fondo ? (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute left-0 top-1 bottom-1 rounded-lg bg-superficie shadow-sutil ring-1 ring-borde-fuerte',
            animar &&
              'transition-[transform,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
          )}
          style={{ width: fondo.ancho, transform: `translateX(${fondo.x}px)` }}
        />
      ) : null}

      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            ref={(el) => {
              if (el) botones.current.set(o.valor, el);
              else botones.current.delete(o.valor);
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${o.valor}`}
            aria-selected={activa}
            aria-controls={`${id}-panel-${o.valor}`}
            tabIndex={activa ? 0 : -1}
            disabled={o.deshabilitada}
            onClick={() => alCambiar(o.valor)}
            className={cn(
              'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200',
              'disabled:cursor-not-allowed disabled:opacity-40',
              ancho && 'flex-1',
              activa ? 'text-tinta' : 'text-tinta-suave hover:text-tinta',
            )}
          >
            {o.icono}
            {o.etiqueta}
            {o.detalle}
          </button>
        );
      })}
    </div>
  );
}

/**
 * El contenido de una pestaña. Se monta sólo cuando está activa, así que lo
 * pesado de las otras no se renderiza. Va con el mismo `id` que usa `Tabs`
 * para `aria-controls`: pasarle el que devuelve `useId()` del padre no hace
 * falta; alcanza con `valor` y `activo`.
 */
export function PanelTab({
  valor,
  activo,
  children,
}: {
  valor: string;
  activo: string;
  children: ReactNode;
}) {
  if (valor !== activo) return null;
  return (
    <div role="tabpanel" tabIndex={0} className="mt-4 focus-visible:outline-none">
      {children}
    </div>
  );
}
