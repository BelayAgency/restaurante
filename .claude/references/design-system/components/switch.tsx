'use client';

import { cn } from '@/lib/cn';

/**
 * Switch chico (32×16), con la geometría squircle.
 *
 * `corner-shape: squircle` es reciente: donde no está soportado cae en el
 * `rounded-[5px]` de base, que con 16px de alto se ve prácticamente igual. Por
 * eso el radio grande va detrás de `supports-[]`.
 *
 * El color encendido es el acento de la marca, no azul: acá el terracota es el
 * que marca estado activo en todo el panel.
 */
export function Switch({
  activo,
  alCambiar,
  etiqueta,
  deshabilitado,
  id,
}: {
  activo: boolean;
  alCambiar: (activo: boolean) => void;
  /** Obligatoria: el control no tiene texto propio. */
  etiqueta: string;
  deshabilitado?: boolean;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => alCambiar(!activo)}
      className={cn(
        'relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center border-none p-0',
        'rounded-[5px] [corner-shape:squircle] supports-[corner-shape:squircle]:rounded-[10px]',
        'transition-colors duration-150 ease-out motion-reduce:transition-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-acento',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Sin anillo exterior: con este tamaño se comía el control. Queda un
        // hairline por dentro, sólo para que el apagado no se pierda contra la
        // superficie en el tema claro.
        // Los tokens son color completo, no tripleta: rgb(var(--x)/a) el
        // navegador lo descarta en silencio y el hairline no aparece nunca.
        'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sombra)_8%,transparent)]',
        activo ? 'bg-acento' : 'bg-borde',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute bottom-0 top-0 w-4 bg-perilla',
          'rounded-[5px] [corner-shape:squircle] supports-[corner-shape:squircle]:rounded-[10px]',
          'shadow-[0_0_1px_0.5px_color-mix(in_srgb,var(--sombra)_20%,transparent),0_1px_2px_color-mix(in_srgb,var(--sombra)_25%,transparent)]',
          'transition-all duration-150 ease-out motion-reduce:transition-none',
          activo ? 'left-4' : 'left-0',
        )}
      />
    </button>
  );
}

/** Switch con texto al lado, que es como se usa en los formularios. */
export function CampoSwitch({
  activo,
  alCambiar,
  titulo,
  descripcion,
  deshabilitado,
}: {
  activo: boolean;
  alCambiar: (activo: boolean) => void;
  titulo: string;
  descripcion?: string;
  deshabilitado?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-tinta">{titulo}</p>
        {descripcion ? <p className="mt-0.5 text-xs text-tinta-tenue">{descripcion}</p> : null}
      </div>
      <div className="pt-0.5">
        <Switch
          activo={activo}
          alCambiar={alCambiar}
          etiqueta={titulo}
          deshabilitado={deshabilitado}
        />
      </div>
    </div>
  );
}
