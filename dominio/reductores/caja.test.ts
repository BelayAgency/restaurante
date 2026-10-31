import { describe, expect, it } from 'vitest';
import type { DatosDe, EventoNuevo, TipoEvento } from '../eventos';
import { arqueo, diferenciaTotal, movimientosDeTurno, reducirCaja, turnoAbierto } from './caja';
import { reducirSalon, saldoCuenta, vistaDeMesas } from './salon';

const DISPOSITIVO = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';
const TURNO = '77777777-7777-4777-8777-777777777777';
const CUENTA = '66666666-6666-4666-8666-666666666666';
const MESA = '11111111-1111-4111-8111-111111111111';
const EFECTIVO = { medioId: '88888888-8888-4888-8888-888888888888', nombre: 'Efectivo', efectivo: true };
const DEBITO = { medioId: '99999999-9999-4999-8999-999999999999', nombre: 'Débito', efectivo: false };

function evento<T extends TipoEvento>(tipo: T, agregadoId: string, datos: DatosDe<T>): EventoNuevo {
  return {
    id: crypto.randomUUID(),
    version: 1,
    tipo,
    dispositivoId: DISPOSITIVO,
    operadorId: 'caja',
    autorizadoPorId: null,
    motivoId: null,
    motivoTexto: null,
    creadoEnDispositivo: '2026-10-28T20:00:00.000Z',
    agregadoId,
    datos,
  } as EventoNuevo;
}

const abrirTurno = (fondo = 1_000_000) => evento('turno_abierto', TURNO, { fondoCentavos: fondo });
const cobro = (consumo: number, propina: number, pagos: { medio: typeof EFECTIVO; monto: number }[]) =>
  evento('cobro_registrado', CUENTA, {
    cobroId: crypto.randomUUID(),
    turnoId: TURNO,
    division: 'total',
    consumoCentavos: consumo,
    propinaCentavos: propina,
    itemIds: [],
    pagos: pagos.map((p) => ({ ...p.medio, montoCentavos: p.monto })),
  });

describe('reducirCaja', () => {
  it('lo esperado en efectivo suma el fondo y descuenta las salidas', () => {
    const estado = reducirCaja([
      abrirTurno(1_000_000),
      cobro(2_000_000, 200_000, [{ medio: EFECTIVO, monto: 1_200_000 }, { medio: DEBITO, monto: 1_000_000 }]),
      evento('salida_caja', TURNO, { salidaId: crypto.randomUUID(), tipo: 'retiro', montoCentavos: 500_000, motivo: 'Depósito al banco' }),
    ]);
    const filas = arqueo(turnoAbierto(estado)!, [EFECTIVO, DEBITO].map((m) => ({ id: m.medioId, nombre: m.nombre, efectivo: m.efectivo })));
    expect(filas.find((f) => f.efectivo)!.esperadoCentavos).toBe(1_000_000 + 1_200_000 - 500_000);
    expect(filas.find((f) => !f.efectivo)!.esperadoCentavos).toBe(1_000_000);
  });

  it('el arqueo ciego deja la diferencia', () => {
    const estado = reducirCaja([
      abrirTurno(1_000_000),
      cobro(1_000_000, 0, [{ medio: EFECTIVO, monto: 1_000_000 }]),
      evento('turno_cerrado', TURNO, { declarado: [{ ...EFECTIVO, montoCentavos: 1_950_000 }] }),
    ]);
    const turno = estado.turnos.get(TURNO)!;
    expect(turno.cerradoEn).not.toBeNull();
    expect(diferenciaTotal(arqueo(turno, []))).toBe(-50_000);
  });

  it('un cobro a un turno cerrado no entra a ese turno', () => {
    const estado = reducirCaja([abrirTurno(), evento('turno_cerrado', TURNO, { declarado: [] }), cobro(100, 0, [{ medio: EFECTIVO, monto: 100 }])]);
    expect(estado.cobrosHuerfanos).toHaveLength(1);
    expect(estado.turnos.get(TURNO)!.cobros).toBe(0);
  });
});

describe('cobro y cierre de la cuenta', () => {
  const abrir = evento('cuenta_abierta', CUENTA, { tipo: 'mesa', mesaId: MESA, mozoId: 'ana', comensales: 2, nombre: null });
  const cargar = evento('item_agregado', CUENTA, {
    itemId: crypto.randomUUID(),
    productoId: crypto.randomUUID(),
    precioId: crypto.randomUUID(),
    nombre: 'Bife',
    precioCentavos: 2_000_000,
    estacionId: crypto.randomUUID(),
    cantidad: 1,
    modificadores: [],
    nota: null,
  });

  it('dos pagos en partes saldan la cuenta y cerrarla libera la mesa', () => {
    const estado = reducirSalon([
      abrir,
      cargar,
      cobro(1_000_000, 0, [{ medio: EFECTIVO, monto: 1_000_000 }]),
      cobro(1_000_000, 100_000, [{ medio: DEBITO, monto: 1_100_000 }]),
      evento('cuenta_cerrada', CUENTA, {}),
    ]);
    const cuenta = estado.cuentas.get(CUENTA)!;
    expect(saldoCuenta(cuenta)).toBe(0);
    expect(cuenta.estado).toBe('cerrada');
    expect(vistaDeMesas(estado).has(MESA)).toBe(false);
    expect(estado.anomalias).toHaveLength(0);
  });

  it('cerrar con saldo queda como anomalía', () => {
    const estado = reducirSalon([abrir, cargar, evento('cuenta_cerrada', CUENTA, {})]);
    expect(estado.anomalias[0]!.detalle).toContain('saldo');
  });
});

describe('movimientosDeTurno', () => {
  it('junta apertura, cobros con su cuenta, salidas, cuentas cerradas sin cobrar y el cierre', () => {
    const otra = '55555555-5555-4555-8555-555555555555';
    const eventos = [
      abrirTurno(500_000),
      evento('cuenta_abierta', CUENTA, { tipo: 'mesa', mesaId: MESA, mozoId: 'ana', comensales: 2, nombre: null }),
      cobro(1_000_000, 100_000, [{ medio: EFECTIVO, monto: 1_100_000 }]),
      evento('salida_caja', TURNO, { salidaId: crypto.randomUUID(), tipo: 'egreso', montoCentavos: 200_000, motivo: 'Hielo' }),
      evento('cuenta_abierta', otra, { tipo: 'mostrador', mesaId: null, mozoId: 'beto', comensales: 0, nombre: null }),
      evento('cuenta_cerrada', otra, {}),
      evento('turno_cerrado', TURNO, { declarado: [{ ...EFECTIVO, montoCentavos: 1_400_000 }] }),
    ];
    const turno = reducirCaja(eventos).turnos.get(TURNO)!;
    const movimientos = movimientosDeTurno(turno, reducirSalon(eventos).cuentas.values());
    expect(movimientos.map((m) => [m.clase, m.montoCentavos]).sort()).toEqual(
      [
        ['apertura', 500_000],
        ['cierre', 1_400_000],
        ['cobro', 1_100_000],
        ['egreso', -200_000],
        ['sin_cobrar', 0],
      ].sort(),
    );
    expect(movimientos.find((m) => m.clase === 'cobro')).toMatchObject({ cuentaId: CUENTA });
  });
});
