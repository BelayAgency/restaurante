import { describe, expect, it } from 'vitest';
import { autorizacionRequerida, puedeAutorizar } from './autorizaciones';
import type { DatosDe, EventoNuevo, TipoEvento } from './eventos';
import { reducirSalon, saldoCuenta, totalCuenta } from './reductores/salon';

const DISPOSITIVO = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';
const CUENTA = '66666666-6666-4666-8666-666666666666';
const MESA = '11111111-1111-4111-8111-111111111111';

function evento<T extends TipoEvento>(tipo: T, datos: DatosDe<T>): EventoNuevo {
  return {
    id: crypto.randomUUID(),
    version: 1,
    tipo,
    dispositivoId: DISPOSITIVO,
    operadorId: 'ana',
    autorizadoPorId: null,
    motivoId: null,
    motivoTexto: null,
    creadoEnDispositivo: '2026-10-28T20:00:00.000Z',
    agregadoId: CUENTA,
    datos,
  } as EventoNuevo;
}

const abrir = evento('cuenta_abierta', { tipo: 'mesa', mesaId: MESA, mozoId: 'ana', comensales: 2, nombre: null });
const ITEM = crypto.randomUUID();
const cargar = (itemId = ITEM, precio = 1_000_000) =>
  evento('item_agregado', {
    itemId,
    productoId: crypto.randomUUID(),
    precioId: crypto.randomUUID(),
    nombre: 'Bife',
    precioCentavos: precio,
    estacionId: crypto.randomUUID(),
    cantidad: 1,
    modificadores: [],
    nota: null,
  });
const precuenta = evento('precuenta_emitida', { precuentaId: crypto.randomUUID(), totalCentavos: 1_000_000 });

describe('autorizacionRequerida', () => {
  it('anular, descontar y retirar efectivo siempre piden autorización', () => {
    const cuenta = reducirSalon([abrir, cargar()]).cuentas.get(CUENTA);
    expect(autorizacionRequerida(evento('item_anulado', { itemId: ITEM }), cuenta)).toBe('anular_item');
    expect(autorizacionRequerida(evento('descuento_aplicado', { descuentoId: crypto.randomUUID(), porcentaje: 10, montoCentavos: 100_000 }), cuenta)).toBe('descuento');
  });

  it('cargar algo después de la precuenta la pide; antes, no', () => {
    const antes = reducirSalon([abrir, cargar()]).cuentas.get(CUENTA);
    const despues = reducirSalon([abrir, cargar(), precuenta]).cuentas.get(CUENTA);
    const nuevo = cargar(crypto.randomUUID());
    expect(autorizacionRequerida(nuevo, antes)).toBeNull();
    expect(autorizacionRequerida(nuevo, despues)).toBe('modificar_tras_precuenta');
  });

  it('cerrar con saldo es cerrar sin cobrar', () => {
    const cuenta = reducirSalon([abrir, cargar()]).cuentas.get(CUENTA);
    expect(autorizacionRequerida(evento('cuenta_cerrada', {}), cuenta)).toBe('cerrar_sin_cobrar');
  });

  it('por defecto autorizan el encargado y el dueño, no el mozo', () => {
    expect(puedeAutorizar('encargado', 'descuento', {})).toBe(true);
    expect(puedeAutorizar('mozo', 'descuento', {})).toBe(false);
    expect(puedeAutorizar('cajero', 'descuento', { descuento: ['cajero'] })).toBe(true);
  });
});

describe('correcciones en la cuenta', () => {
  it('lo anulado y la cortesía no se cobran, el descuento resta', () => {
    const otro = crypto.randomUUID();
    const tercero = crypto.randomUUID();
    const estado = reducirSalon([
      abrir,
      cargar(ITEM, 1_000_000),
      cargar(otro, 500_000),
      cargar(tercero, 300_000),
      evento('item_anulado', { itemId: ITEM }),
      evento('item_cortesia', { itemId: otro }),
      evento('descuento_aplicado', { descuentoId: crypto.randomUUID(), porcentaje: null, montoCentavos: 100_000 }),
    ]);
    const cuenta = estado.cuentas.get(CUENTA)!;
    expect(totalCuenta(cuenta)).toBe(200_000);
    expect(cuenta.items.get(ITEM)!.anulado).toBe(true);
  });

  it('cambiar el precio guarda el original', () => {
    const cuenta = reducirSalon([abrir, cargar(), evento('precio_modificado', { itemId: ITEM, precioCentavos: 800_000 })]).cuentas.get(CUENTA)!;
    expect(saldoCuenta(cuenta)).toBe(800_000);
    expect(cuenta.items.get(ITEM)!.precioOriginalCentavos).toBe(1_000_000);
  });

  it('una cuenta cerrada se puede reabrir', () => {
    const estado = reducirSalon([abrir, cargar(), evento('cuenta_cerrada', {}), evento('cuenta_reabierta', {})]);
    expect(estado.cuentas.get(CUENTA)!.estado).toBe('abierta');
  });
});
