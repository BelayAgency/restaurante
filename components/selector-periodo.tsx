'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown } from 'lucide-react';
import { TIPOS, valorRango, type TipoPeriodo } from '@/lib/periodos';
import { cn } from '@/lib/cn';

/**
 * El nombre del período, que además abre el filtro.
 *
 * Se aprieta lo que dice «Septiembre de 2026» y ahí se elige mirar por semana,
 * por mes o por año. El dato ES el control: no hace falta un selector aparte al
 * lado de algo que ya nombra lo que está filtrando.
 *
 * Las opciones son enlaces, no botones: el período vive en la URL. Así funciona
 * el atrás del navegador, se puede compartir «la semana pasada» y la pantalla
 * se sigue renderizando en el servidor.
 *
 * «Rango» también es un enlace: al apretarlo se pasa de una a modo rango con
 * exactamente lo que se estaba mirando (`valores.rango`), sin pedir fechas
 * antes. Recién ahí aparecen los dos campos de fecha, ya cargados, para
 * ajustarlos y aplicar (`?tipo=rango&valor=2026-09-03_2026-09-18`). Se usa a través de
 * `NavegadorPeriodo` (`periodo.tsx`), que le pasa los `valores` ya calculados.
 */
export function SelectorPeriodo({
  ruta,
  etiqueta,
  tipo,
  valores,
  desde,
  hasta,
}: {
  /** La pantalla a la que apuntan los enlaces, sin query string: `/facturacion`. */
  ruta: string;
  etiqueta: string;
  tipo: TipoPeriodo;
  /** A qué `valor` va cada tipo si se lo elige, ya calculado en el servidor. */
  valores: Record<TipoPeriodo, string>;
  /** Los límites del período actual, para precargar los campos del rango. */
  desde: string;
  hasta: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const [rangoDesde, setRangoDesde] = useState(desde);
  const [rangoHasta, setRangoHasta] = useState(hasta);

  // Se ajusta durante el render y no en un efecto: con el efecto, el campo
  // pintaba un cuadro con el rango del período anterior.
  const [limitesPrevios, setLimitesPrevios] = useState({ desde, hasta });
  if (limitesPrevios.desde !== desde || limitesPrevios.hasta !== hasta) {
    setLimitesPrevios({ desde, hasta });
    setRangoDesde(desde);
    setRangoHasta(hasta);
  }

  const aplicarRango = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangoDesde || !rangoHasta) return;
    setAbierto(false);
    router.push(`${ruta}?tipo=rango&valor=${valorRango(rangoDesde, rangoHasta)}`);
  };

  useEffect(() => {
    if (!abierto) return;

    // Cerrar al hacer clic afuera y con Escape. Sin esto la lista queda abierta
    // tapando lo de abajo y hay que volver a apretar el título para sacarla.
    const alTocar = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', alTocar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alTocar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative">
      {/* Ancho mínimo fijo: la etiqueta cambia de largo entre «2026» y
          «29 dic 2025 – 4 ene 2026», y sin piso las flechas saltan de lugar
          debajo del dedo al ir y venir. */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        title="Cambiar el período"
        className="inline-flex min-w-40 items-center justify-center gap-1.5 rounded-lg bg-lienzo px-2.5 py-1.5 text-sm font-medium text-tinta transition-colors hover:bg-borde/60"
      >
        {etiqueta}
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn('text-tinta-tenue transition-transform', abierto && 'rotate-180')}
        />
      </button>

      {abierto ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-56 rounded-xl bg-superficie p-1 shadow-flotante"
        >
          {TIPOS.map((o) => (
            <Link
              key={o.tipo}
              role="menuitem"
              href={`${ruta}?tipo=${o.tipo}&valor=${valores[o.tipo]}`}
              // «Rango» deja la lista abierta: al llegar ya viene con el período
              // anterior cargado y lo que sigue es ajustar las fechas.
              onClick={() => o.tipo !== 'rango' && setAbierto(false)}
              className={cn(
                'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-lienzo',
                o.tipo === tipo ? 'font-medium text-tinta' : 'text-tinta-suave',
              )}
            >
              {o.etiqueta}
              {o.tipo === tipo ? (
                <Check size={14} strokeWidth={2} className="text-acento" />
              ) : null}
            </Link>
          ))}

          {tipo === 'rango' ? (
            <form onSubmit={aplicarRango} className="mt-1 space-y-2 border-t border-borde px-3 pb-2 pt-3">
              <label className="block text-xs text-tinta-tenue">
                Desde
                <input
                  type="date"
                  required
                  value={rangoDesde}
                  max={rangoHasta || undefined}
                  onChange={(e) => setRangoDesde(e.target.value)}
                  className="mt-1 block w-full rounded-lg bg-lienzo px-2.5 py-1.5 text-sm text-tinta outline-none focus:ring-2 focus:ring-acento/40"
                />
              </label>
              <label className="block text-xs text-tinta-tenue">
                Hasta
                <input
                  type="date"
                  required
                  value={rangoHasta}
                  min={rangoDesde || undefined}
                  onChange={(e) => setRangoHasta(e.target.value)}
                  className="mt-1 block w-full rounded-lg bg-lienzo px-2.5 py-1.5 text-sm text-tinta outline-none focus:ring-2 focus:ring-acento/40"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-lg bg-acento px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-acento-hover"
              >
                Aplicar
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
