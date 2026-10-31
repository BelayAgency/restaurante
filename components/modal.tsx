'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useCierreFondo } from '@/lib/cierre-fondo';

/**
 * Modal sobre `<dialog>` nativo.
 *
 * Se apoya en el elemento del navegador en vez de recrearlo con divs: el foco
 * atrapado, el cierre con Escape, el `inert` sobre el resto de la página y el
 * `::backdrop` vienen dados. Rehacer todo eso a mano es mucho código y casi
 * siempre queda con algún agujero de accesibilidad.
 *
 * Los eventos `cancel` y `close` se escuchan con `addEventListener` y no con
 * las props `onCancel`/`onClose` de React: no siempre quedan atadas al evento
 * nativo, y cuando fallan Escape cierra el diálogo sin avisarle al estado —
 * quedaba el modal cerrado pero la URL y el formulario como si siguiera abierto.
 *
 * Quién cierra es siempre React: `cancel` se cancela y se delega en `alCerrar`,
 * que cambia el estado y recién ahí el efecto llama a `close()`. Así hay una
 * sola fuente de verdad.
 */

export function Modal({
  abierto,
  alCerrar,
  titulo,
  descripcion,
  acciones,
  lateral,
  ancho,
  children,
}: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  descripcion?: string;
  /** Va en el encabezado, antes de cerrar: por ejemplo un `MenuAcciones`. */
  acciones?: ReactNode;
  /** Panel pegado al borde derecho y de alto completo, sin fondo oscuro ni bloqueo: lo de atrás se sigue usando. */
  lateral?: boolean;
  /** Más ancho que el de un formulario: para dos columnas, como armar una orden. */
  ancho?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fondo = useCierreFondo(alCerrar);

  // El callback cambia de identidad en cada render; guardarlo en una ref evita
  // reenganchar los listeners a cada rato.
  const alCerrarRef = useRef(alCerrar);
  // eslint-disable-next-line react-hooks/refs -- patrón del design system de la agencia
  alCerrarRef.current = alCerrar;

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;

    const alCancelar = (evento: Event) => {
      // Se frena el cierre nativo: cierra React cambiando el estado.
      evento.preventDefault();
      alCerrarRef.current();
    };

    dialogo.addEventListener('cancel', alCancelar);
    return () => dialogo.removeEventListener('cancel', alCancelar);
  }, []);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;

    if (abierto && !dialogo.open) {
      // El lateral no es modal: se sigue operando lo de atrás con él abierto.
      if (lateral) dialogo.show();
      else dialogo.showModal();
      // Sin esto el foco cae en el botón de cerrar, que es el primer focusable
      // del diálogo. Se prefiere el primer campo del formulario.
      dialogo.querySelector<HTMLElement>('[data-foco-inicial]')?.focus();
    } else if (!abierto && dialogo.open) {
      dialogo.close();
    }
  }, [abierto, lateral]);

  useEffect(() => {
    if (!abierto || !lateral) return;
    // Un diálogo abierto con `show()` no recibe `cancel`: Escape se escucha a mano.
    const alTeclear = (e: KeyboardEvent) => {
      // Con un modal encima (abierto desde el panel), Escape es para ese, no para el panel.
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('dialog:modal')) alCerrarRef.current();
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto, lateral]);

  useEffect(() => {
    if (!abierto || lateral) return;
    // `showModal` bloquea la interacción con el fondo pero no su scroll.
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto, lateral]);

  return (
    <dialog
      ref={ref}
      className={lateral ? 'modal modal-lateral' : ancho ? 'modal modal-ancho' : 'modal'}
      aria-labelledby="modal-titulo"
      {...(lateral ? {} : fondo)}
    >
      {/* En el lateral ocupa todo el alto: con poco contenido el cuerpo crece y el pie queda contra el piso. */}
      <div className={lateral ? 'modal-panel h-full' : 'modal-panel'}>
        <header className="modal-encabezado">
          <div className="min-w-0">
            <h2 id="modal-titulo" className="text-lg font-semibold text-tinta">
              {titulo}
            </h2>
            {descripcion ? (
              <p className="mt-0.5 text-sm text-tinta-tenue">{descripcion}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {acciones}
            <button
              type="button"
              onClick={alCerrar}
              aria-label="Cerrar"
              className="fila-nav-accion pointer-events-auto opacity-100"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {children}
      </div>
    </dialog>
  );
}
