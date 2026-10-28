'use client';

import { useId } from 'react';

/**
 * Curva de actividad por hora — pensada para "pedidos por hora", "ventas por
 * hora", cualquier serie chica y pareja a lo largo del día.
 *
 * El color es siempre `var(--color-acento)`, nunca uno fijo: es el mismo
 * acento que ya rebrandea el resto del sistema, así que este gráfico cambia
 * de color solo con cada cliente, sin tocar nada acá.
 *
 * La curva se suaviza con Catmull-Rom pasado a Bézier (tensión 1/6): es la
 * cuenta de siempre para que una spline pase EXACTO por cada punto de datos,
 * a diferencia de una curva de ajuste que los aproxima. Con picos de
 * actividad reales hace falta que el punto quede donde el dato dice, no
 * donde le quede cómodo a la curva.
 */

interface Punto {
  x: number;
  y: number;
}

/** Catmull-Rom → Bézier. Los puntos de los extremos se duplican para que el
 * tramo final tenga de dónde sacar su tangente. */
function curvaSuave(puntos: Punto[]): string {
  if (puntos.length < 2) return '';
  const p = [puntos[0], ...puntos, puntos[puntos.length - 1]];
  let d = `M ${puntos[0].x.toFixed(2)} ${puntos[0].y.toFixed(2)}`;

  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

const ANCHO = 1000;
const ALTO = 100;
/** Deja aire arriba y abajo: un pico real no llega nunca al borde del svg. */
const MARGEN_SUPERIOR = 8;
const MARGEN_INFERIOR = 8;

export function GraficoActividad({
  datos,
  etiquetas,
  alto = 112,
  descripcion = 'Curva de actividad por hora',
}: {
  /** Un valor por bucket — típicamente 24, uno por hora. */
  datos: number[];
  /**
   * Las marcas del eje, típicamente `datos.length + 1` (los bordes de cada
   * hora). Por default, horas de "00" a `datos.length` con cero a la
   * izquierda. En mobile se muestra 1 de cada 3 para no amontonarlas.
   */
  etiquetas?: string[];
  /** Alto del contenedor en px. El svg no tiene alto propio: crece con esto. */
  alto?: number;
  descripcion?: string;
}) {
  const idGradiente = useId();
  const n = datos.length;

  const listaEtiquetas =
    etiquetas ?? Array.from({ length: n + 1 }, (_, i) => String(i).padStart(2, '0'));

  const maximo = Math.max(...datos, 1);
  const minimo = Math.min(...datos, 0);
  const rango = maximo - minimo || 1;

  // Un punto por bucket, centrado en su intervalo — por eso arranca a medio
  // paso del borde y no en x=0: el dato de la hora 0 representa esa hora
  // entera, no el instante 00:00.
  const paso = ANCHO / n;
  const puntos: Punto[] = datos.map((valor, i) => ({
    x: paso * (i + 0.5),
    y:
      ALTO -
      MARGEN_INFERIOR -
      ((valor - minimo) / rango) * (ALTO - MARGEN_SUPERIOR - MARGEN_INFERIOR),
  }));

  const lineaTrazo = curvaSuave(puntos);
  const lineaRelleno = `${lineaTrazo} L ${puntos[puntos.length - 1].x.toFixed(2)} ${ALTO} L ${puntos[0].x.toFixed(2)} ${ALTO} Z`;

  return (
    <div className="px-4 pb-3">
      <div className="relative" style={{ height: alto }}>
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={descripcion}
        >
          <defs>
            <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-acento)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-acento)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={lineaRelleno} fill={`url(#${idGradiente})`} stroke="none" />
          <path
            d={lineaTrazo}
            fill="none"
            stroke="var(--color-acento)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="mt-1 flex justify-between text-[0.5625rem] tabular-nums text-tinta-tenue">
        {listaEtiquetas.map((etiqueta, i) => (
          <span key={i} className={i % 3 !== 0 ? 'hidden sm:inline' : undefined}>
            {etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}
