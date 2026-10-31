import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Primitivas visuales del panel.
 *
 * Bordes redondeados moderados, sombras muy sutiles en vez de bordes duros y
 * mucho aire entre secciones. Nada de layouts densos de dashboard clásico.
 */

// ---------------------------------------------------------------------------

export function Tarjeta({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <section className={cn('tarjeta', padding && 'p-5 sm:p-6', className)}>{children}</section>
  );
}

export function TituloSeccion({
  children,
  descripcion,
  accion,
}: {
  children: ReactNode;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div>
        <h2 className="text-lg font-semibold text-tinta">{children}</h2>
        {descripcion ? <p className="mt-1 text-sm text-tinta-tenue">{descripcion}</p> : null}
      </div>
      {accion}
    </div>
  );
}

// ---------------------------------------------------------------------------

const TONOS_INSIGNIA = {
  neutro: 'bg-borde/50 text-tinta-suave',
  acento: 'bg-acento-tenue text-acento',
  exito: 'bg-exito-tenue text-exito',
  alerta: 'bg-alerta-tenue text-alerta',
  error: 'bg-error-tenue text-error',
} as const;

export type TonoInsignia = keyof typeof TONOS_INSIGNIA;

export function Insignia({
  children,
  tono = 'neutro',
  className,
}: {
  children: ReactNode;
  tono?: TonoInsignia;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
        TONOS_INSIGNIA[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Punto({ tono = 'neutro' }: { tono?: TonoInsignia }) {
  const color = {
    neutro: 'bg-tinta-tenue',
    acento: 'bg-acento',
    exito: 'bg-exito',
    alerta: 'bg-alerta',
    error: 'bg-error',
  }[tono];
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', color)} />;
}

// ---------------------------------------------------------------------------

/**
 * Estado vacío. La redacción es directa y en lenguaje del negocio: "No hay
 * cobros pendientes", no "0 resultados".
 */
export function EstadoVacio({
  titulo,
  detalle,
  icono,
  accion,
}: {
  titulo: string;
  detalle?: string;
  icono?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icono ? <div className="text-tinta-tenue">{icono}</div> : null}
      <p className="text-base font-medium text-tinta">{titulo}</p>
      {detalle ? <p className="max-w-sm text-sm text-tinta-tenue">{detalle}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}

/**
 * Un cartel de aviso.
 *
 * El título es OPCIONAL, y en los errores conviene no ponerlo: los mensajes ya
 * vienen del servidor como frases completas ("El código no es correcto o ya
 * venció"), así que encabezarlos con un "No se pudo" agrega una línea que no
 * dice nada y empuja la que sí dice algo al renglón de abajo, en gris.
 *
 * Sin título, el mensaje toma el color y el peso que tenía el título: la
 * jerarquía es la misma, lo que cambia es que arriba de todo hay información.
 */
export function Aviso({
  tono = 'alerta',
  titulo,
  children,
}: {
  tono?: TonoInsignia;
  titulo?: string;
  children?: ReactNode;
}) {
  const fondo = {
    neutro: 'bg-borde/40',
    acento: 'bg-acento-tenue',
    exito: 'bg-exito-tenue',
    alerta: 'bg-alerta-tenue',
    error: 'bg-error-tenue',
  }[tono];
  const texto = {
    neutro: 'text-tinta',
    acento: 'text-acento',
    exito: 'text-exito',
    alerta: 'text-alerta',
    error: 'text-error',
  }[tono];

  return (
    <div className={cn('rounded-xl px-4 py-3.5', fondo)}>
      {titulo ? <p className={cn('text-sm font-medium', texto)}>{titulo}</p> : null}
      {children ? (
        <div className={cn('text-sm', titulo ? 'mt-1 text-tinta-suave' : cn('font-medium', texto))}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Metrica({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: TonoInsignia;
}) {
  return (
    <div className="tarjeta min-w-0 p-4 sm:p-5">
      <p className="text-xs text-tinta-tenue sm:text-sm">{etiqueta}</p>
      <p
        className={cn(
          // Un monto de decenas de millones tiene que entrar entero: de a dos en el teléfono y de a cuatro en escritorio.
          'mt-1.5 whitespace-nowrap text-base font-semibold tracking-tight tabular-nums sm:text-xl',
          tono === 'acento' ? 'text-acento' : 'text-tinta',
        )}
      >
        {valor}
      </p>
      {detalle ? <p className="mt-1 text-xs text-tinta-tenue sm:text-sm">{detalle}</p> : null}
    </div>
  );
}

export function FilaDato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-borde/60 py-2.5 last:border-0">
      <dt className="text-sm text-tinta-tenue">{etiqueta}</dt>
      <dd className="text-right text-sm font-medium text-tinta">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-borde px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-tinta-tenue first:pl-0 last:pr-0',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={cn(
        // Un monto no se parte: con el $ en un renglón y el número en otro no se lee.
        'border-b border-borde/50 px-3 py-3 align-middle text-tinta first:pl-0 last:pr-0 [&.tabular-nums]:whitespace-nowrap',
        className,
      )}
    >
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code className={cn('font-mono text-xs text-tinta-suave', className)}>{children}</code>
  );
}

export function Consola({ children }: { children: string }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-lienzo p-4 font-mono text-xs leading-relaxed text-tinta-suave ring-1 ring-borde">
      {children}
    </pre>
  );
}
