'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Isla de acciones.
 *
 * La barra de un punto de venta: una píldora que flota sobre el contenido en
 * vez de pegarse a un borde, porque en una pantalla de mostrador el pulgar
 * llega al centro de abajo mucho antes que a una esquina. Sólo iconos, en
 * botones redondos: el nombre de cada acción viaja en `aria-label` y no
 * impreso, así que elegí iconos que se entiendan sin leyenda.
 *
 * El componente dibuja el atajo Y lo hace funcionar. Son la misma cosa: un
 * cartelito que anuncia una tecla que no hace nada es peor que no ponerlo,
 * porque el cajero la prueba una vez y no vuelve a confiar en ninguno.
 *
 * El atajo sale por fuera de la isla, arriba del botón. Se revela al pasar por
 * encima —de a uno se descubre una acción— y todos juntos mientras se mantiene
 * Alt, que es como se aprende el teclado entero.
 */

export interface ItemIsla {
  id: string;
  /** No se imprime: es el nombre accesible del botón. */
  etiqueta: string;
  icono: ReactNode;
  /** Una tecla como la reporta el navegador: 'F2', 'b', 'Escape'. */
  atajo?: string;
  alApretar: () => void;
  activa?: boolean;
  /** La que cierra la venta. Una sola por isla, o el acento deja de significar. */
  primaria?: boolean;
  deshabilitada?: boolean;
}

/**
 * En un POS el lector de código de barras es un teclado: teclea el código en el
 * campo que tenga el foco y termina con Enter. Si la isla escuchara igual, un
 * código con una "B" adentro dispararía "Buscar" en la mitad de la lectura.
 */
function estaEscribiendo(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false;
  if (destino.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName);
}

export function Isla({ items, className }: { items: ItemIsla[]; className?: string }) {
  const [revelarTodos, setRevelarTodos] = useState(false);

  useEffect(() => {
    function alApretarTecla(e: KeyboardEvent): void {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        // Sin esto, en Firefox el Alt suelto se lleva el foco a la barra de
        // menú del navegador y la siguiente tecla ya no llega a la app.
        e.preventDefault();
        setRevelarTodos(true);
      }

      if (estaEscribiendo(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;

      const item = items.find(
        (i) => i.atajo && !i.deshabilitada && i.atajo.toLowerCase() === e.key.toLowerCase(),
      );
      if (!item) return;

      e.preventDefault();
      item.alApretar();
    }

    function alSoltarTecla(e: KeyboardEvent): void {
      if (e.key === 'Alt') setRevelarTodos(false);
    }

    // Alt+Tab se lleva la ventana con el Alt apretado y el keyup nunca llega:
    // sin esto los atajos quedan revelados para siempre.
    const alPerderFoco = () => setRevelarTodos(false);

    window.addEventListener('keydown', alApretarTecla);
    window.addEventListener('keyup', alSoltarTecla);
    window.addEventListener('blur', alPerderFoco);
    return () => {
      window.removeEventListener('keydown', alApretarTecla);
      window.removeEventListener('keyup', alSoltarTecla);
      window.removeEventListener('blur', alPerderFoco);
    };
  }, [items]);

  return (
    <nav className={cn('isla', className)} data-atajos={revelarTodos} aria-label="Acciones">
      {items.map((item, i) => (
        <div key={item.id} className="contents">
          {/* La primaria no es la última de la lista, es otra cosa. */}
          {item.primaria && i > 0 ? <span className="isla-sep" aria-hidden="true" /> : null}
          <button
            type="button"
            onClick={item.alApretar}
            disabled={item.deshabilitada}
            data-activa={item.activa ? 'true' : undefined}
            data-primaria={item.primaria ? 'true' : undefined}
            // Sin texto adentro, el botón no tiene nombre accesible sin esto.
            aria-label={item.etiqueta}
            // Lo anuncia el lector de pantalla; por eso el <kbd> va oculto.
            aria-keyshortcuts={item.atajo}
            aria-current={item.activa ? 'page' : undefined}
            className="isla-item"
          >
            {item.atajo ? (
              <kbd className="isla-atajo" aria-hidden="true">
                {item.atajo}
              </kbd>
            ) : null}
            <span className="isla-icono">{item.icono}</span>
          </button>
        </div>
      ))}
    </nav>
  );
}
