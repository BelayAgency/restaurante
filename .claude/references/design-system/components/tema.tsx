'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Selector de tema. Claro/oscuro desde el arranque, no como agregado posterior:
 * el panel se usa tanto a las 10 de la mañana como a la medianoche.
 *
 * El script que evita el parpadeo al cargar está en el layout, no acá: tiene
 * que correr antes del primer pintado, mucho antes de que hidrate React.
 */

type Tema = 'claro' | 'oscuro' | 'sistema';

const OPCIONES: { valor: Tema; icono: typeof Sun; etiqueta: string }[] = [
  { valor: 'claro', icono: Sun, etiqueta: 'Claro' },
  { valor: 'oscuro', icono: Moon, etiqueta: 'Oscuro' },
  { valor: 'sistema', icono: Monitor, etiqueta: 'Sistema' },
];

export function aplicarTema(tema: Tema): void {
  const oscuro =
    tema === 'oscuro' ||
    (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', oscuro);
}

export function SelectorTema() {
  const [tema, setTema] = useState<Tema>('sistema');
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    const guardado = (localStorage.getItem('belay-tema') as Tema | null) ?? 'sistema';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee localStorage al montar; patrón del design system
    setTema(guardado);
    setMontado(true);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => {
      if ((localStorage.getItem('belay-tema') as Tema | null) === 'sistema') {
        aplicarTema('sistema');
      }
    };
    media.addEventListener('change', alCambiar);
    return () => media.removeEventListener('change', alCambiar);
  }, []);

  const elegir = (valor: Tema) => {
    localStorage.setItem('belay-tema', valor);
    setTema(valor);
    aplicarTema(valor);
  };

  return (
    <div className="selector-tema flex items-center gap-0.5 rounded-lg bg-fill-fantasma-hover p-0.5">
      {OPCIONES.map(({ valor, icono: Icono, etiqueta }) => (
        <button
          key={valor}
          type="button"
          onClick={() => elegir(valor)}
          title={etiqueta}
          aria-label={`Tema ${etiqueta.toLowerCase()}`}
          aria-pressed={montado && tema === valor}
          className={cn(
            'rounded-md transition-colors',
            montado && tema === valor
              ? 'bg-fill-secundario text-tinta shadow-campo'
              : 'text-tinta-tenue hover:text-tinta',
          )}
        >
          <Icono size={15} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
