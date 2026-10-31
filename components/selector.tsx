'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Selector.
 *
 * Reemplaza al `<select>` nativo en todos los casos. El desplegable del nativo
 * lo dibuja el sistema operativo, fuera del documento: no hay CSS que lo
 * alcance, así que sale gris de Windows en un panel que no tiene nada gris.
 * Sólo se puede estilar la caja cerrada, y entonces el control miente: parece
 * nuestro hasta que se abre.
 *
 * Tres variantes, todas el mismo componente:
 *   · lista pelada
 *   · con buscador, cuando hay más de ocho o diez opciones
 *   · con una acción al pie para crear algo sin salir del formulario
 *
 * Lo que NO hace: no permite elegir varias, y no acepta valores libres. Las dos
 * cosas cambian el contrato con el formulario y merecen su propio componente en
 * vez de un par de props más acá.
 */

export interface OpcionSelector {
  valor: string;
  etiqueta: string;
  /** Se muestra en gris al lado de la etiqueta, y también entra en la búsqueda. */
  detalle?: string;
  icono?: ReactNode;
}

export function Selector({
  opciones,
  valor,
  alElegir,
  placeholder = 'Elegí una opción',
  buscador,
  placeholderBusqueda = 'Buscar…',
  vacio = 'No hay ninguna opción con ese nombre',
  crear,
  deshabilitado,
  id,
}: {
  opciones: OpcionSelector[];
  valor: string | null;
  alElegir: (valor: string) => void;
  placeholder?: string;
  /** Sin esto no aparece el campo de búsqueda. */
  buscador?: boolean;
  placeholderBusqueda?: string;
  vacio?: string;
  /** La acción del pie. Se le pasa lo tipeado para poder precargar el alta. */
  crear?: { texto: string; alCrear: (escrito: string) => void };
  deshabilitado?: boolean;
  id?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [escrito, setEscrito] = useState('');
  const [marcada, setMarcada] = useState(0);
  const [posicion, setPosicion] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  const caja = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const campoBusqueda = useRef<HTMLInputElement>(null);
  const idLista = useId();

  const elegida = opciones.find((o) => o.valor === valor) ?? null;

  const visibles = useMemo(() => {
    const q = escrito.trim().toLowerCase();
    if (!q) return opciones;
    return opciones.filter((o) => `${o.etiqueta} ${o.detalle ?? ''}`.toLowerCase().includes(q));
  }, [opciones, escrito]);

  /**
   * La posición se calcula en JS y el menú va con `position: fixed`, no
   * `absolute` colgado del disparador. Es la única forma de que no lo corte
   * el modal: `overflow-hidden` en un ancestro SÍ recorta un `absolute`
   * adentro suyo, pero no alcanza a un `fixed` — salvo que alguien le ponga
   * `transform` al modal, que acá sólo pasa un instante durante la
   * animación de entrada, con el modal todavía cerrado para elegir nada.
   */
  function medirPosicion(): void {
    const rect = disparador.current?.getBoundingClientRect();
    if (!rect) return;
    // Si abajo no entra (un selector al pie de la navegación), se abre hacia
    // arriba. Antes de que el menú exista se estima con el alto máximo de la lista.
    const alto = menu.current?.offsetHeight ?? 240;
    const abajo = window.innerHeight - rect.bottom - 6;
    const haciaArriba = abajo < alto && rect.top - 6 > abajo;
    setPosicion(
      haciaArriba
        ? { bottom: window.innerHeight - rect.top + 6, left: rect.left, width: rect.width }
        : { top: rect.bottom + 6, left: rect.left, width: rect.width },
    );
  }

  useEffect(() => {
    if (!abierto) return;
    medirPosicion();
    // Segunda medición con el menú ya dibujado y su alto real.
    const cuadro = requestAnimationFrame(medirPosicion);
    // `capture: true` en window: el scroll del cuerpo del modal no burbujea
    // como evento normal, pero sí llega acá en la fase de captura.
    window.addEventListener('scroll', medirPosicion, true);
    window.addEventListener('resize', medirPosicion);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener('scroll', medirPosicion, true);
      window.removeEventListener('resize', medirPosicion);
    };
  }, [abierto]);

  function abrir(): void {
    if (deshabilitado) return;
    setEscrito('');
    setAbierto(true);
    // Se arranca sobre la que ya está elegida: reabrir un selector y tener que
    // buscar de nuevo dónde quedó lo propio es trabajo que no aporta.
    setMarcada(Math.max(0, opciones.findIndex((o) => o.valor === valor)));
  }

  /**
   * Al cerrar se devuelve el foco al disparador. Sin eso, quien vino por teclado
   * queda en la nada y tiene que tabular desde el principio del formulario.
   */
  function cerrar(devolverFoco = true): void {
    setAbierto(false);
    if (devolverFoco) disparador.current?.focus();
  }

  function elegir(opcion: OpcionSelector): void {
    alElegir(opcion.valor);
    cerrar();
  }

  useEffect(() => {
    if (abierto && buscador) campoBusqueda.current?.focus();
  }, [abierto, buscador]);

  useEffect(() => {
    if (!abierto) return;

    const alClickear = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) cerrar(false);
    };
    document.addEventListener('mousedown', alClickear);
    return () => document.removeEventListener('mousedown', alClickear);
  }, [abierto]);

  function alTeclear(e: React.KeyboardEvent): void {
    if (!abierto) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        abrir();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMarcada((i) => Math.min(i + 1, visibles.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMarcada((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opcion = visibles[marcada];
      if (opcion) elegir(opcion);
    }
  }

  return (
    <div ref={caja} className="selector" data-abierto={abierto} onKeyDown={alTeclear}>
      <button
        ref={disparador}
        id={id}
        type="button"
        disabled={deshabilitado}
        onClick={() => (abierto ? cerrar() : abrir())}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={idLista}
        className={cn('campo selector-disparador', deshabilitado && 'cursor-not-allowed opacity-50')}
      >
        <span className="selector-valor" data-vacio={!elegida}>
          {elegida ? elegida.etiqueta : placeholder}
        </span>
        <ChevronDown size={16} strokeWidth={1.5} className="selector-chevron" />
      </button>

      {abierto && posicion ? (
        <div ref={menu} className="selector-menu" id={idLista} role="listbox" style={posicion}>
          {buscador ? (
            <div className="selector-buscar">
              <Search size={16} strokeWidth={1.5} />
              <input
                ref={campoBusqueda}
                value={escrito}
                onChange={(e) => {
                  setEscrito(e.target.value);
                  setMarcada(0);
                }}
                placeholder={placeholderBusqueda}
                aria-label={placeholderBusqueda}
              />
            </div>
          ) : null}

          {visibles.length > 0 ? (
            <div className="selector-lista">
              {visibles.map((opcion, i) => (
                <button
                  key={opcion.valor}
                  type="button"
                  role="option"
                  aria-selected={opcion.valor === valor}
                  data-marcada={i === marcada}
                  onMouseEnter={() => setMarcada(i)}
                  onClick={() => elegir(opcion)}
                  className="selector-opcion"
                >
                  {opcion.icono ? (
                    <span className="shrink-0 text-tinta-tenue">{opcion.icono}</span>
                  ) : null}
                  <span className="min-w-0 truncate">
                    {opcion.etiqueta}
                    {opcion.detalle ? (
                      <span className="selector-secundario"> · {opcion.detalle}</span>
                    ) : null}
                  </span>
                  <Check size={16} strokeWidth={1.5} className="selector-tilde" />
                </button>
              ))}
            </div>
          ) : (
            <p className="selector-vacio">{vacio}</p>
          )}

          {crear ? (
            <div className="selector-pie">
              <button
                type="button"
                onClick={() => {
                  // Se cierra SIN devolver el foco: lo que sigue es un modal, y
                  // devolverlo acá le pelearía el foco inicial.
                  cerrar(false);
                  crear.alCrear(escrito.trim());
                }}
                className="selector-opcion"
              >
                <Plus size={16} strokeWidth={1.5} />
                {crear.texto}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
