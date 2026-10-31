'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

const claseBoton =
  'inline-flex cursor-pointer items-center gap-1 rounded-lg border-0 bg-transparent px-3 py-1.5 text-sm font-medium text-tinta-suave transition-colors hover:bg-fill-fantasma-hover hover:text-tinta disabled:pointer-events-none disabled:opacity-40';

/**
 * Para listas que ya están enteras en el cliente, como las de adentro de un
 * modal: ahí la página no puede vivir en la URL sin sacar al usuario de lo que
 * estaba mirando. Se ve igual que `Paginacion`, que sí va por la URL.
 */
export function usePaginaLocal<T>(filas: T[], porPagina: number) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / porPagina));
  // Si la lista se achica (se anuló algo), no quedarse en una página vacía.
  const actual = Math.min(pagina, totalPaginas);
  return {
    visibles: filas.slice((actual - 1) * porPagina, actual * porPagina),
    controles: { pagina: actual, totalPaginas, totalFilas: filas.length, alCambiar: setPagina },
  };
}

export function PaginacionLocal({ pagina, totalPaginas, totalFilas, alCambiar }: { pagina: number; totalPaginas: number; totalFilas: number; alCambiar: (pagina: number) => void }) {
  if (totalPaginas <= 1) return null;
  return (
    <nav className="mt-2 flex items-center justify-between gap-4 text-sm" aria-label="Paginación">
      <p className="text-tinta-tenue">
        Página {pagina} de {totalPaginas} · {totalFilas} en total
      </p>
      <div className="flex items-center gap-1">
        <button type="button" className={cn(claseBoton)} disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
          <ChevronLeft size={15} strokeWidth={1.5} /> Anterior
        </button>
        <button type="button" className={cn(claseBoton)} disabled={pagina >= totalPaginas} onClick={() => alCambiar(pagina + 1)}>
          Siguiente <ChevronRight size={15} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
