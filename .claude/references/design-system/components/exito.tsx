import { cn } from '@/lib/cn';

/**
 * El tilde grande de "salió bien", para cerrar un trámite dentro de un modal.
 *
 * Se dibuja a mano y no con el ícono de Lucide porque hace falta animar el
 * trazo, y para eso el `path` tiene que ser nuestro: el círculo entra primero
 * y el tilde se dibuja encima. Las dos animaciones viven en `globals.css`,
 * donde ya está el resto del movimiento del panel y su regla de
 * `prefers-reduced-motion`.
 */
export function Exito({
  titulo,
  detalle,
  className,
}: {
  titulo: string;
  detalle?: string;
  className?: string;
}) {
  return (
    <div className={cn('py-6 text-center', className)} role="status">
      <svg
        viewBox="0 0 52 52"
        className="exito-circulo mx-auto h-20 w-20"
        aria-hidden="true"
        fill="none"
      >
        <circle cx="26" cy="26" r="25" className="fill-exito/10" />
        <path
          d="M15 26.5 L22.5 34 L37 19"
          className="exito-trazo stroke-exito"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <p className="mt-5 text-base font-semibold text-tinta">{titulo}</p>
      {detalle ? <p className="mt-1.5 text-sm text-tinta-suave">{detalle}</p> : null}
    </div>
  );
}
