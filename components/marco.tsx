'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { useCierreFondo } from '@/lib/cierre-fondo';

/**
 * Marco — el mueble del panel.
 *
 * Navegación fija a la izquierda, contenido a la derecha. Abajo de 900px la
 * navegación no desaparece: se muda a un cajón que se abre desde una barra
 * superior. Esconderla sin reemplazo deja al sistema sin ninguna forma de
 * navegar en el celular, que es el estado en el que suelen quedar los paneles
 * "desktop-first".
 *
 * La navegación se pasa como `nav` y se dibuja DOS veces —en la columna y en
 * el cajón— a propósito. La alternativa es moverla de lugar con JavaScript
 * según el ancho, que en cada resize desmonta y remonta la lista y pierde el
 * scroll, el foco y cualquier estado abierto. Sólo una de las dos copias está
 * viva a la vez: la otra está en `display:none` o dentro de un diálogo cerrado.
 */

function Pie({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <>
      {/* Empuja el pie contra el piso. Es del componente, no de quien lo usa. */}
      <div className="flex-1" aria-hidden="true" />
      {children}
    </>
  );
}

export function Marco({
  nombreSistema,
  nav,
  pie,
  children,
}: {
  nombreSistema: string;
  /** La lista de secciones. Se dibuja en la columna y en el cajón. */
  nav: ReactNode;
  /**
   * Lo que va contra el piso de la navegación: el selector de tema y la
   * tarjeta de usuario. Va como prop y no mezclado en `nav` porque el
   * separador que lo empuja abajo lo pone el componente: si dependiera de que
   * cada proyecto se acuerde de agregarlo, en algunos quedaría pegado abajo
   * del último ítem y en otros no.
   */
  pie?: ReactNode;
  children: ReactNode;
}) {
  const [cajonAbierto, setCajonAbierto] = useState(false);
  const cajon = useRef<HTMLDialogElement>(null);
  const fondoCajon = useCierreFondo(() => setCajonAbierto(false));

  useEffect(() => {
    const d = cajon.current;
    if (!d) return;

    // Cierra React cambiando el estado, no el diálogo por su cuenta: una sola
    // fuente de verdad. Mismo criterio que el modal.
    const alCancelar = (e: Event) => {
      e.preventDefault();
      setCajonAbierto(false);
    };
    d.addEventListener('cancel', alCancelar);
    return () => d.removeEventListener('cancel', alCancelar);
  }, []);

  useEffect(() => {
    const d = cajon.current;
    if (!d) return;
    if (cajonAbierto && !d.open) d.showModal();
    else if (!cajonAbierto && d.open) d.close();
  }, [cajonAbierto]);

  /**
   * Al pasar a ancho de escritorio el cajón tiene que cerrarse solo. Si no,
   * queda un diálogo abierto sobre una navegación que ya está visible al lado,
   * con el resto de la página `inert` y sin nada que se pueda apretar.
   */
  useEffect(() => {
    const ancho = window.matchMedia('(min-width: 900px)');
    const alCambiar = () => {
      if (ancho.matches) setCajonAbierto(false);
    };
    ancho.addEventListener('change', alCambiar);
    return () => ancho.removeEventListener('change', alCambiar);
  }, []);

  return (
    <div className="marco">
      <aside className="marco-lateral">
        <div className="marco-fijo">
          <nav aria-label="Secciones" className="flex h-full flex-col gap-0.5 px-3 py-5">
            {nav}
            <Pie>{pie}</Pie>
          </nav>
        </div>
      </aside>

      <div className="marco-principal">
        <div className="barra-movil">
          <button
            type="button"
            onClick={() => setCajonAbierto(true)}
            aria-label="Abrir la navegación"
            aria-expanded={cajonAbierto}
            className="fila-nav-accion pointer-events-auto opacity-100"
          >
            <Menu size={18} strokeWidth={1.5} />
          </button>
          <span className="truncate text-lg font-medium">{nombreSistema}</span>
        </div>

        <main className="marco-contenido">{children}</main>
      </div>

      <dialog
        ref={cajon}
        className="cajon"
        aria-label="Navegación"
        {...fondoCajon}
      >
        <nav aria-label="Secciones" className="flex h-full flex-col gap-0.5 px-3 py-5">
          <div className="mb-2 flex items-center justify-between gap-2 px-2">
            <span className="truncate text-lg font-medium">{nombreSistema}</span>
            <button
              type="button"
              onClick={() => setCajonAbierto(false)}
              aria-label="Cerrar"
              className="fila-nav-accion pointer-events-auto opacity-100"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
          {nav}
          <Pie>{pie}</Pie>
        </nav>
      </dialog>
    </div>
  );
}
