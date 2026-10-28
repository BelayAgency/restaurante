'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Avatar } from './avatar';

/**
 * La tarjeta de quien está usando el panel, al pie de la navegación.
 *
 * El menú se abre HACIA ARRIBA: la tarjeta vive abajo de todo, y hacia abajo se
 * saldría de la pantalla. Va antes que el disparador en el DOM y se posiciona
 * por CSS, así el orden de tabulación entra al menú recién después de abrirlo
 * y no antes de saber que existe.
 *
 * No lleva un "cerrar sesión" suelto al lado del nombre: esa acción y la de
 * perfil se apretaban por error una en lugar de la otra. Adentro de un menú
 * que hay que abrir primero, no pasa.
 */

export interface AccionUsuario {
  texto: string;
  icono: ReactNode;
  alElegir: () => void;
}

export function MenuUsuario({
  nombre,
  email,
  foto,
  acciones,
}: {
  nombre: string;
  email: string;
  foto?: string | null;
  acciones: AccionUsuario[];
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!abierto) return;

    const alClickear = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      // Devolver el foco: sin esto, quien vino por teclado queda en la nada.
      disparador.current?.focus();
    };

    document.addEventListener('mousedown', alClickear);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alClickear);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="caja-usuario">
      {abierto ? (
        <div className="menu-usuario" id={idMenu} role="menu">
          {acciones.map((a) => (
            <button
              key={a.texto}
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                a.alElegir();
              }}
            >
              {a.icono}
              {a.texto}
            </button>
          ))}
        </div>
      ) : null}

      <button
        ref={disparador}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        className="tarjeta-usuario"
      >
        <Avatar nombre={nombre} foto={foto} tamano="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-tinta text-(length:--fila-fuente)">{nombre}</span>
          <span className="block truncate text-tinta-tenue text-(length:--fila-fuente-secundaria)">{email}</span>
        </span>
        <ChevronsUpDown size={14} strokeWidth={1.5} className="shrink-0 text-tinta-tenue" />
      </button>
    </div>
  );
}
