import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

const claseBoton =
  'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-tinta-suave transition-colors hover:bg-fill-fantasma-hover hover:text-tinta';

export function Paginacion({
  pagina,
  totalPaginas,
  totalFilas,
  construirHref,
}: {
  pagina: number;
  totalPaginas: number;
  totalFilas: number;
  construirHref: (pagina: number) => string;
}) {
  if (totalPaginas <= 1) return null;

  return (
    <nav className="flex items-center justify-between gap-4 text-sm" aria-label="Paginación">
      <p className="text-tinta-tenue">
        Página {pagina} de {totalPaginas} · {totalFilas} en total
      </p>
      <div className="flex items-center gap-1">
        <Link
          href={construirHref(pagina - 1)}
          aria-disabled={pagina <= 1}
          className={cn(claseBoton, pagina <= 1 && 'pointer-events-none opacity-40')}
        >
          <ChevronLeft size={15} strokeWidth={1.5} />
          Anterior
        </Link>
        <Link
          href={construirHref(pagina + 1)}
          aria-disabled={pagina >= totalPaginas}
          className={cn(claseBoton, pagina >= totalPaginas && 'pointer-events-none opacity-40')}
        >
          Siguiente
          <ChevronRight size={15} strokeWidth={1.5} />
        </Link>
      </div>
    </nav>
  );
}
