import { describe, expect, it } from 'vitest';
import { cuentaCorriente, movimientosCuenta, type ComprobanteCuenta, type PagoCuenta } from './cuenta-corriente';

let orden = 0;
function factura(id: string, fecha: string, total: number, extra: Partial<ComprobanteCuenta> = {}): ComprobanteCuenta {
  orden += 1;
  return { id, tipo: 'factura', fecha, registradaEn: new Date(Date.UTC(2026, 9, 1, 0, 0, orden)).toISOString(), totalCentavos: total, enReclamo: false, anulada: false, ...extra };
}
function pago(id: string, fecha: string, importe: number, anulado = false): PagoCuenta {
  orden += 1;
  return { id, fecha, registradoEn: new Date(Date.UTC(2026, 9, 1, 0, 0, orden)).toISOString(), importeCentavos: importe, anulado };
}

describe('cuentaCorriente', () => {
  it('un pago cancela de la factura más vieja a la más nueva, aunque se hayan cargado al revés', () => {
    const nueva = factura('nueva', '2026-10-20', 300);
    const vieja = factura('vieja', '2026-10-05', 500);
    const cuenta = cuentaCorriente([nueva, vieja], [pago('p1', '2026-10-25', 600)]);
    expect(cuenta.facturas.get('vieja')).toMatchObject({ estado: 'pagada', saldoCentavos: 0 });
    expect(cuenta.facturas.get('nueva')).toMatchObject({ estado: 'parcial', pagadoCentavos: 100, saldoCentavos: 200 });
    expect(cuenta.deudaCentavos).toBe(200);
  });

  it('lo que sobra queda a favor y alcanza a la factura que entra después', () => {
    const sinFactura = cuentaCorriente([factura('a', '2026-10-01', 100)], [pago('p', '2026-10-02', 250)]);
    expect(sinFactura.saldoAFavorCentavos).toBe(150);
    const conFactura = cuentaCorriente([factura('a', '2026-10-01', 100), factura('b', '2026-10-10', 120)], [pago('p', '2026-10-02', 250)]);
    expect(conFactura.facturas.get('b')!.estado).toBe('pagada');
    expect(conFactura.saldoAFavorCentavos).toBe(30);
  });

  it('una factura en reclamo no la cancela ningún pago, pero sigue en la deuda', () => {
    const cuenta = cuentaCorriente([factura('r', '2026-10-01', 400, { enReclamo: true }), factura('b', '2026-10-05', 100)], [pago('p', '2026-10-06', 100)]);
    expect(cuenta.facturas.get('r')).toMatchObject({ estado: 'reclamo', saldoCentavos: 400 });
    expect(cuenta.facturas.get('b')!.estado).toBe('pagada');
    expect(cuenta.deudaCentavos).toBe(400);
    expect(cuenta.enReclamoCentavos).toBe(400);
  });

  it('una nota de crédito descuenta como un pago; lo anulado no cuenta', () => {
    const cuenta = cuentaCorriente(
      [factura('a', '2026-10-01', 1000), factura('nc', '2026-10-03', 300, { tipo: 'nota_credito' }), factura('x', '2026-10-04', 999, { anulada: true })],
      [pago('p', '2026-10-05', 200), pago('anulado', '2026-10-06', 500, true)],
    );
    expect(cuenta.facturas.get('a')).toMatchObject({ pagadoCentavos: 500, saldoCentavos: 500, estado: 'parcial' });
    expect(cuenta.facturas.get('x')!.estado).toBe('anulada');
    expect(cuenta.deudaCentavos).toBe(500);
  });

  it('anular una factura vieja corre el pago a la siguiente', () => {
    const pagos = [pago('p', '2026-10-10', 100)];
    const antes = cuentaCorriente([factura('a', '2026-10-01', 100), factura('b', '2026-10-02', 100)], pagos);
    expect(antes.facturas.get('b')!.estado).toBe('pendiente');
    const despues = cuentaCorriente([factura('a', '2026-10-01', 100, { anulada: true }), factura('b', '2026-10-02', 100)], pagos);
    expect(despues.facturas.get('b')!.estado).toBe('pagada');
  });

  it('el resumen acumula el saldo como el del proveedor', () => {
    const movimientos = movimientosCuenta([factura('a', '2026-10-01', 500), factura('b', '2026-10-03', 200)], [pago('p', '2026-10-02', 300)]);
    expect(movimientos.map((m) => [m.id, m.saldoCentavos])).toEqual([
      ['a', 500],
      ['p', 200],
      ['b', 400],
    ]);
  });
});
