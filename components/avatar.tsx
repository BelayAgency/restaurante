import { cn } from '@/lib/cn';

/**
 * La cara de quien usa el panel.
 *
 * Sin foto no se dibuja una silueta gris: se pone la inicial sobre el acento de
 * la marca. Un panel de tres personas se lee mejor por color e inicial que por
 * el mismo icono repetido tres veces.
 *
 * Es un componente de servidor a propósito: la foto viene con los datos de la
 * sesión y no hay nada que hidratar.
 */

const TAMANOS = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
} as const;

export function Avatar({
  nombre,
  foto,
  tamano = 'md',
  className,
}: {
  nombre: string;
  foto?: string | null;
  tamano?: keyof typeof TAMANOS;
  className?: string;
}) {
  const inicial = nombre.trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-acento font-semibold text-white select-none',
        TAMANOS[tamano],
        className,
      )}
      aria-hidden="true"
    >
      {foto ? (
        // Sin `next/image`: es un data URL que ya viene del tamaño justo, y
        // pasarlo por el optimizador no ahorra nada.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="" className="h-full w-full object-cover" />
      ) : (
        inicial
      )}
    </span>
  );
}
