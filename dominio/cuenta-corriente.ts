/**
 * La cuenta corriente con un proveedor. Se le paga a él, no a una factura: lo
 * pagado (y lo que descuentan las notas de crédito) cancela las facturas de la
 * más vieja a la más nueva. Lo que sobra es saldo a favor y alcanza a la
 * próxima que entre.
 *
 * Se calcula siempre de cero a partir de comprobantes y pagos. No se guarda:
 * anular o corregir algo viejo reacomoda todo lo que sigue, y la cuenta cierra
 * igual que el resumen que manda el proveedor.
 */

export type TipoComprobante = 'factura' | 'nota_credito';
export type EstadoFactura = 'pendiente' | 'parcial' | 'pagada' | 'reclamo' | 'anulada';

export interface ComprobanteCuenta {
  id: string;
  tipo: TipoComprobante;
  fecha: string;
  /** Desempata dos del mismo día: entra primero el que se cargó primero. */
  registradaEn: string;
  totalCentavos: number;
  enReclamo: boolean;
  anulada: boolean;
}

export interface PagoCuenta {
  id: string;
  fecha: string;
  registradoEn: string;
  importeCentavos: number;
  anulado: boolean;
}

export interface Imputacion {
  /** El pago o la nota de crédito que la cubre. */
  origenId: string;
  origenTipo: 'pago' | 'nota_credito';
  facturaId: string;
  importeCentavos: number;
}

export interface SituacionFactura {
  pagadoCentavos: number;
  saldoCentavos: number;
  estado: EstadoFactura;
  imputaciones: Imputacion[];
}

export interface CuentaCorriente {
  facturas: Map<string, SituacionFactura>;
  imputaciones: Imputacion[];
  /** Lo que se debe, reclamos incluidos: se discuten, pero están facturadas. */
  deudaCentavos: number;
  enReclamoCentavos: number;
  saldoAFavorCentavos: number;
}

const enOrden = <T extends { fecha: string; registrado: string }>(a: T, b: T) => a.fecha.localeCompare(b.fecha) || a.registrado.localeCompare(b.registrado);

export function cuentaCorriente(comprobantes: ComprobanteCuenta[], pagos: PagoCuenta[]): CuentaCorriente {
  const facturas = new Map<string, SituacionFactura>();
  for (const c of comprobantes) {
    if (c.tipo !== 'factura') continue;
    facturas.set(c.id, {
      pagadoCentavos: 0,
      saldoCentavos: c.anulada ? 0 : c.totalCentavos,
      estado: c.anulada ? 'anulada' : c.enReclamo ? 'reclamo' : 'pendiente',
      imputaciones: [],
    });
  }

  const deudas = comprobantes
    .filter((c) => c.tipo === 'factura' && !c.anulada && !c.enReclamo && c.totalCentavos > 0)
    .map((c) => ({ id: c.id, fecha: c.fecha, registrado: c.registradaEn }))
    .sort(enOrden);
  const creditos = [
    ...pagos.filter((p) => !p.anulado).map((p) => ({ id: p.id, tipo: 'pago' as const, fecha: p.fecha, registrado: p.registradoEn, importe: p.importeCentavos })),
    ...comprobantes
      .filter((c) => c.tipo === 'nota_credito' && !c.anulada)
      .map((c) => ({ id: c.id, tipo: 'nota_credito' as const, fecha: c.fecha, registrado: c.registradaEn, importe: c.totalCentavos })),
  ].sort(enOrden);

  const imputaciones: Imputacion[] = [];
  let siguiente = 0;
  let saldoAFavorCentavos = 0;
  for (const credito of creditos) {
    let resto = credito.importe;
    while (resto > 0 && siguiente < deudas.length) {
      const situacion = facturas.get(deudas[siguiente]!.id)!;
      const aplicado = Math.min(resto, situacion.saldoCentavos);
      const imputacion = { origenId: credito.id, origenTipo: credito.tipo, facturaId: deudas[siguiente]!.id, importeCentavos: aplicado };
      imputaciones.push(imputacion);
      situacion.imputaciones.push(imputacion);
      situacion.pagadoCentavos += aplicado;
      situacion.saldoCentavos -= aplicado;
      resto -= aplicado;
      if (situacion.saldoCentavos === 0) siguiente += 1;
    }
    saldoAFavorCentavos += resto;
  }

  let deudaCentavos = 0;
  let enReclamoCentavos = 0;
  for (const situacion of facturas.values()) {
    if (situacion.estado === 'anulada') continue;
    deudaCentavos += situacion.saldoCentavos;
    if (situacion.estado === 'reclamo') enReclamoCentavos += situacion.saldoCentavos;
    else situacion.estado = situacion.saldoCentavos === 0 ? 'pagada' : situacion.pagadoCentavos > 0 ? 'parcial' : 'pendiente';
  }

  return { facturas, imputaciones, deudaCentavos, enReclamoCentavos, saldoAFavorCentavos };
}

export interface MovimientoCuenta {
  id: string;
  clase: 'factura' | 'nota_credito' | 'pago';
  fecha: string;
  /** Positivo suma deuda; negativo la baja. */
  importeCentavos: number;
  /** El saldo después de este movimiento. Positivo: se le debe. */
  saldoCentavos: number;
}

/**
 * El resumen de cuenta: comprobantes y pagos mezclados por fecha con el saldo
 * acumulado, como el que manda el proveedor, para poder cruzarlos. Lo anulado
 * no está: no movió la cuenta.
 */
export function movimientosCuenta(comprobantes: ComprobanteCuenta[], pagos: PagoCuenta[]): MovimientoCuenta[] {
  const todos = [
    ...comprobantes
      .filter((c) => !c.anulada)
      .map((c) => ({ id: c.id, clase: c.tipo, fecha: c.fecha, registrado: c.registradaEn, importeCentavos: c.tipo === 'factura' ? c.totalCentavos : -c.totalCentavos })),
    ...pagos.filter((p) => !p.anulado).map((p) => ({ id: p.id, clase: 'pago' as const, fecha: p.fecha, registrado: p.registradoEn, importeCentavos: -p.importeCentavos })),
  ].sort(enOrden);
  let saldo = 0;
  return todos.map((m) => {
    saldo += m.importeCentavos;
    return { id: m.id, clase: m.clase, fecha: m.fecha, importeCentavos: m.importeCentavos, saldoCentavos: saldo };
  });
}
