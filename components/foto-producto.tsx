import type { ReactNode } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { urlFotoProducto } from '@/dominio/catalogo';
import { cn } from '@/lib/cn';

/** Una foto chica, o un lugar neutro del mismo tamaño con un ícono si no hay: así la grilla o la fila no saltan. */
export function Miniatura({ url, icono, className }: { url: string | null; icono: ReactNode; className?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden bg-lienzo text-tinta-tenue', className)}>
      {url ? (
        // Un <img> y no next/image: ya llega achicada, y el optimizador la pediría a otra
        // dirección que el dispositivo no guarda para mostrarla sin red.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        icono
      )}
    </span>
  );
}

/** La foto de un plato. */
export function FotoProducto({ producto, className }: { producto: { id: string; fotoVersion?: string | null }; className?: string }) {
  return (
    <Miniatura
      url={producto.fotoVersion ? urlFotoProducto(producto.id, producto.fotoVersion) : null}
      icono={<UtensilsCrossed size={16} strokeWidth={1.5} aria-hidden="true" />}
      className={className}
    />
  );
}
