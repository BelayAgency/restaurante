'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';
import { Boton } from './boton';

/**
 * El botón de tres puntos con las acciones secundarias de algo.
 *
 * El menú va con `position: fixed` calculado contra el disparador, como el
 * `Selector`: suele vivir adentro de un modal con `overflow-hidden`, y colgado
 * con `absolute` del padre quedaría recortado. Se cierra al apretar afuera
 * (`pointerdown`, no al soltar) y con Escape.
 */

export interface AccionMenu {
  texto: string;
  icono: ReactNode;
  alElegir: () => void;
  deshabilitada?: boolean;
  /** Para un menú que elige una opción, como un filtro: la elegida lleva una tilde. */
  marcada?: boolean;
}

export function MenuAcciones({
  acciones,
  etiqueta = 'Más acciones',
  disparador: contenidoDisparador,
}: {
  acciones: AccionMenu[];
  etiqueta?: string;
  /** Un botón con texto en vez de los tres puntos: «Filtros». El menú se abre igual, alineado a su derecha. */
  disparador?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; right: number } | null>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  useLayoutEffect(() => {
    if (!abierto || !disparador.current) return;
    const caja = disparador.current.getBoundingClientRect();
    setPosicion({ top: caja.bottom + 4, right: window.innerWidth - caja.right });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alApretar = (e: PointerEvent) => {
      const objetivo = e.target as Node;
      if (!menu.current?.contains(objetivo) && !disparador.current?.contains(objetivo)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Que Escape cierre el menú y no el modal que lo contiene.
      e.stopPropagation();
      e.preventDefault();
      setAbierto(false);
      disparador.current?.focus();
    };
    const alMoverse = () => setAbierto(false);
    document.addEventListener('pointerdown', alApretar);
    document.addEventListener('keydown', alTeclear, true);
    window.addEventListener('resize', alMoverse);
    return () => {
      document.removeEventListener('pointerdown', alApretar);
      document.removeEventListener('keydown', alTeclear, true);
      window.removeEventListener('resize', alMoverse);
    };
  }, [abierto]);

  return (
    <>
      {contenidoDisparador ? (
        <Boton
          ref={disparador}
          variante="secundario"
          tamano="sm"
          onClick={() => setAbierto((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={abierto}
          aria-controls={abierto ? idMenu : undefined}
        >
          {contenidoDisparador}
        </Boton>
      ) : (
        <button
          ref={disparador}
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-label={etiqueta}
          aria-haspopup="menu"
          aria-expanded={abierto}
          aria-controls={abierto ? idMenu : undefined}
          className="fila-nav-accion pointer-events-auto opacity-100"
        >
          <MoreHorizontal size={16} strokeWidth={1.5} />
        </button>
      )}
      {abierto && posicion ? (
        <div ref={menu} id={idMenu} role="menu" className="menu-acciones" style={{ top: posicion.top, right: posicion.right }}>
          {acciones.map((a) => (
            <button
              key={a.texto}
              type="button"
              role={a.marcada === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={a.marcada}
              disabled={a.deshabilitada}
              onClick={() => {
                setAbierto(false);
                a.alElegir();
              }}
            >
              {a.icono}
              {a.texto}
              {a.marcada ? <Check size={15} strokeWidth={1.75} className="ml-auto text-acento" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
