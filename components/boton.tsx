import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Botones.
 *
 * El relleno no vive en el botón sino en una capa aparte, absoluta y detrás del
 * contenido. Eso permite dos cosas que con un `background` directo no salen: el
 * "squish" al apretar (se encoge el fondo, no el texto, así el label no
 * tiembla) y el anillo de foco por dentro del relleno sin que empuje el layout.
 *
 * El acento queda reservado para la acción primaria de cada vista. Si en una
 * pantalla hay dos botones con el color de marca, alguno de los dos no es
 * primario.
 */

const BASE =
  'group/btn relative isolate inline-flex shrink-0 cursor-pointer select-none items-center ' +
  'justify-center whitespace-nowrap rounded-lg border-0 font-sans outline-none ' +
  'transition-shadow duration-150 focus-visible:outline-none focus-visible:shadow-foco ' +
  'disabled:pointer-events-none disabled:opacity-50';

/** Clases de la capa de relleno, no del botón. */
const RELLENOS = {
  primario: 'bg-acento group-hover/btn:bg-acento-hover',
  secundario: 'bg-fill-secundario group-hover/btn:bg-fill-secundario-hover shadow-campo',
  fantasma: 'bg-transparent group-hover/btn:bg-fill-fantasma-hover',
  peligro: 'bg-error-tenue group-hover/btn:bg-error/15',
} as const;

const TEXTOS = {
  primario: 'text-white font-medium',
  secundario: 'text-tinta font-normal',
  fantasma: 'text-tinta-suave group-hover/btn:text-tinta font-normal',
  peligro: 'text-error font-normal',
} as const;

/** `lg` es el del formulario de acceso: una sola acción, a lo ancho de la caja. */
const TAMANOS = {
  sm: 'h-8 gap-1.5 px-2.5 text-sm',
  md: 'h-9 gap-2 px-3.5 text-base',
  lg: 'h-11 gap-2 px-5 text-base',
} as const;

const SOLO_ICONO = {
  sm: 'aspect-square w-8 px-0',
  md: 'aspect-square w-9 px-0',
  lg: 'aspect-square w-11 px-0',
} as const;

export type VarianteBoton = keyof typeof RELLENOS;
export type TamanoBoton = keyof typeof TAMANOS;

interface Aspecto {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /** Botón cuadrado, sólo con el icono adentro. Exige `aria-label`. */
  soloIcono?: boolean;
  /** Ocupa todo el ancho disponible. */
  ancho?: boolean;
}

function clases({ variante = 'secundario', tamano = 'md', soloIcono, ancho }: Aspecto, extra?: string) {
  return cn(
    BASE,
    TEXTOS[variante],
    TAMANOS[tamano],
    soloIcono && SOLO_ICONO[tamano],
    ancho && 'w-full',
    extra,
  );
}

/**
 * Capa de relleno. `inset-[0.5px]` en el primario: sobre un fondo saturado, el
 * borde exterior del relleno queda apenas por dentro del radio del botón y el
 * antialias no deja una línea clara alrededor.
 */
function Relleno({ variante }: { variante: VarianteBoton }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute -z-[1] rounded-[inherit]',
        variante === 'primario' ? 'inset-[0.5px]' : 'inset-0',
      )}
    >
      <span
        className={cn(
          'absolute inset-0 rounded-[inherit] ease-out',
          'transition-[background-color,box-shadow,transform] duration-150',
          'motion-reduce:transition-none',
          'group-active/btn:scale-[0.97]',
          // Los tokens de color son color completo, no tripleta: va `var(--x)`
          // pelado y no `rgb(var(--x))`, que el navegador descarta en silencio.
          'group-focus-visible/btn:shadow-[inset_0_0_0_1px_var(--color-lienzo)]',
          RELLENOS[variante],
        )}
      />
    </span>
  );
}

function Contenido({ children }: { children: ReactNode }) {
  return <span className="inline-flex min-w-0 items-center gap-1.5">{children}</span>;
}

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement>, Aspecto {
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
  /**
   * Muestra el spinner y deshabilita el botón. El label NO se reemplaza por
   * "Cargando…": el ancho del botón cambiaría y el resto de la fila se
   * correría justo mientras se espera. El spinner entra al lado.
   */
  cargando?: boolean;
}

export function Boton({
  variante = 'secundario',
  tamano = 'md',
  soloIcono,
  ancho,
  cargando,
  className,
  children,
  disabled,
  ...props
}: PropsBoton) {
  return (
    <button
      className={clases({ variante, tamano, soloIcono, ancho }, className)}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...props}
    >
      <Relleno variante={variante} />
      <Contenido>
        {cargando ? (
          <LoaderCircle
            size={15}
            strokeWidth={2}
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
        ) : null}
        {children}
      </Contenido>
    </button>
  );
}

export function BotonEnlace({
  href,
  variante = 'secundario',
  tamano = 'md',
  soloIcono,
  ancho,
  className,
  children,
  descargar,
}: Aspecto & { href: string; className?: string; children: ReactNode; descargar?: boolean }) {
  // Un archivo (un PDF de una ruta de API) no es una página: con Link, Next intentaría navegarlo.
  if (descargar) {
    return (
      <a href={href} download className={clases({ variante, tamano, soloIcono, ancho }, className)}>
        <Relleno variante={variante} />
        <Contenido>{children}</Contenido>
      </a>
    );
  }
  return (
    <Link href={href} className={clases({ variante, tamano, soloIcono, ancho }, className)}>
      <Relleno variante={variante} />
      <Contenido>{children}</Contenido>
    </Link>
  );
}
