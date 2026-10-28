import { cn } from '@/lib/cn';

/**
 * Estado de carga.
 *
 * Con la forma de lo que se está esperando, no un spinner centrado: si el
 * esqueleto tiene la misma silueta que los datos, el salto al llegar es un
 * cambio de color y no un salto de layout. Un spinner en el medio de la
 * pantalla obliga a recomponer la vista entera cuando termina.
 *
 * Reusa `animate-pulso`, la misma animación que ya usa el resto del sistema, y
 * por lo tanto respeta `prefers-reduced-motion` igual que todo lo demás.
 *
 * `aria-hidden` a propósito: quien escucha no necesita que le lean cinco
 * rectángulos grises. El aviso de que algo está cargando lo da el contenedor
 * con `aria-busy`.
 */

export function Esqueleto({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulso rounded-md bg-borde', className)}
    />
  );
}

/** Filas de una tabla o de una lista que todavía no llegó. */
export function CargandoFilas({ filas = 5, className }: { filas?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy="true">
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Esqueleto className="h-4 flex-1" />
          {/* Anchos distintos y fijos: si fueran iguales se lee como una grilla
              vacía en vez de como texto que todavía no llegó. */}
          <Esqueleto className="h-4 w-24" />
          <Esqueleto className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Una tarjeta entera todavía sin datos. */
export function CargandoTarjeta({ className }: { className?: string }) {
  return (
    <div className={cn('tarjeta flex flex-col gap-3 p-5 sm:p-6', className)} aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <Esqueleto className="h-4 w-32" />
      <Esqueleto className="h-7 w-40" />
      <Esqueleto className="h-3 w-24" />
    </div>
  );
}
