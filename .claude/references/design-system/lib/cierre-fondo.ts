import { useRef, type PointerEvent, type MouseEvent } from 'react';

/**
 * Cerrar un `<dialog>` tocando el fondo, sin cerrarlo por accidente.
 *
 * Un modal sólo se cierra si el gesto EMPEZÓ y TERMINÓ en el fondo. Al soltar el
 * botón del mouse, el navegador le asigna el `click` al elemento que contiene
 * tanto el punto donde se apretó como el punto donde se soltó: si alguien aprieta
 * adentro (seleccionando el texto de un campo, por ejemplo) y suelta sobre el
 * fondo, el click le cae al propio `<dialog>`, y un modal que cierra con
 * cualquier click sobre el diálogo se cierra sin que nadie lo pida, a veces con
 * un formulario a medio llenar. (En inglés: el problema del «backdrop click» con
 * arrastre.)
 *
 * La solución: recordar dónde se apretó. `onPointerDown` anota si el toque
 * empezó en el fondo y `onClick` cierra sólo si además termina ahí.
 *
 * Se usa en TODO `<dialog>` que cierre tocando afuera (`modal.tsx`,
 * `configuracion.tsx`, el cajón de `marco.tsx` y cualquiera nuevo):
 *
 *     const fondo = useCierreFondo(alCerrar);
 *     <dialog {...fondo} ...>
 *
 * El contenido vive en hijos, así que un evento cuyo `target` es el propio
 * `<dialog>` sólo puede venir del fondo. Los menús y desplegables no tienen
 * este problema mientras decidan al apretar (`pointerdown`) y no al soltar.
 */
export function useCierreFondo(alCerrar: () => void) {
  const empezoEnFondo = useRef(false);

  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      empezoEnFondo.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      const cierra = empezoEnFondo.current && e.target === e.currentTarget;
      empezoEnFondo.current = false;
      if (cierra) alCerrar();
    },
  };
}
