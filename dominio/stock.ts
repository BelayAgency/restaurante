/**
 * Las cuentas del stock que no dependen de la base: cuánto insumo lleva una
 * venta, cuánto cuesta un plato y cómo cambia el costo con una compra.
 */

export type UnidadBase = 'g' | 'ml' | 'u' | 'parte';

export const NOMBRE_UNIDAD: Record<UnidadBase, string> = { g: 'g', ml: 'ml', u: 'u.', parte: 'partes' };

export interface LineaReceta {
  insumoId: string;
  /** Neto, lo que termina en el plato. */
  cantidad: number;
  mermaPorcentaje: number;
}

/** Lo que hay que sacar del depósito para tener `cantidad` neta: con merma, más. */
export function cantidadBruta(linea: LineaReceta): number {
  const merma = Math.min(Math.max(linea.mermaPorcentaje, 0), 95);
  return linea.cantidad / (1 - merma / 100);
}

/**
 * Cuánto de cada insumo consume vender `porciones` de algo cuya receta rinde
 * `rendimiento`. Una preparación intermedia figura como insumo propio: lo que
 * descuenta de sus componentes lo registra la producción, no la venta.
 */
export function consumoDeReceta(lineas: LineaReceta[], rendimiento: number, porciones: number): Map<string, number> {
  const consumo = new Map<string, number>();
  const factor = porciones / (rendimiento > 0 ? rendimiento : 1);
  for (const linea of lineas) consumo.set(linea.insumoId, (consumo.get(linea.insumoId) ?? 0) + cantidadBruta(linea) * factor);
  return consumo;
}

/** Costo de una porción, en centavos (con decimales: se redondea al mostrar). */
export function costoPorcion(lineas: LineaReceta[], rendimiento: number, costoUnitario: (insumoId: string) => number): number {
  let total = 0;
  for (const [insumoId, cantidad] of consumoDeReceta(lineas, rendimiento, 1)) total += cantidad * costoUnitario(insumoId);
  return total;
}

/** Food cost: qué parte del precio de venta se va en mercadería. */
export function foodCostPorcentaje(costoCentavos: number, precioCentavos: number): number | null {
  if (precioCentavos <= 0) return null;
  return (costoCentavos / precioCentavos) * 100;
}

/**
 * Costo promedio ponderado (decisión 0.5): lo que había vale lo que valía y lo
 * que entra, lo que costó. Con stock negativo o nulo manda la compra: no hay
 * nada viejo que promediar.
 */
export function costoPromedio(stockActual: number, costoActual: number, cantidadNueva: number, costoNuevo: number): number {
  if (cantidadNueva <= 0) return costoActual;
  if (stockActual <= 0) return costoNuevo;
  return (stockActual * costoActual + cantidadNueva * costoNuevo) / (stockActual + cantidadNueva);
}

const NUMERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** `1250 g`, `1,5 ml`, `12 u.` */
export function formatearCantidad(cantidad: number, unidad: UnidadBase): string {
  return `${NUMERO.format(cantidad)} ${NOMBRE_UNIDAD[unidad]}`;
}

/** Con la composición declarada, cuántas unidades físicas son: `13.500 ml · 18 u.` */
export function formatearConUnidades(cantidad: number, unidad: UnidadBase, contenidoPorUnidad: number | null): string {
  const base = formatearCantidad(cantidad, unidad);
  return contenidoPorUnidad ? `${base} · ${NUMERO.format(cantidad / contenidoPorUnidad)} u.` : base;
}

export interface Medida {
  unidad: UnidadBase;
  contenidoPorUnidad: number | null;
}

/**
 * Por cuánto se multiplica una cantidad al cambiar de medida. La composición es
 * el puente: si una botella trae 750 ml, pasar de unidades a ml es ×750, y de
 * ml a partes (5 copas por botella), ×5/750. Sin composición de los dos lados
 * no hay cuenta posible (ml a g depende de qué sea): devuelve null.
 */
export function factorDeConversion(de: Medida, a: Medida): number | null {
  if (de.unidad === a.unidad) return 1;
  const porUnidad = (m: Medida) => (m.unidad === 'u' ? 1 : m.contenidoPorUnidad);
  const desde = porUnidad(de);
  const hasta = porUnidad(a);
  return desde && hasta ? hasta / desde : null;
}
