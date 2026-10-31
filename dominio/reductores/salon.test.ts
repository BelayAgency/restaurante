import { describe, expect, it } from 'vitest';
import type { DatosDe, EventoNuevo, TipoEvento } from '../eventos';
import { reducirSalon, totalCuenta, vistaDeMesas } from './salon';

const DISPOSITIVO = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';
const MESA = '11111111-1111-4111-8111-111111111111';
const OTRA_MESA = '22222222-2222-4222-8222-222222222222';
const PRODUCTO = '33333333-3333-4333-8333-333333333333';
const ESTACION = '44444444-4444-4444-8444-444444444444';

let reloj = 0;
function evento<T extends TipoEvento>(tipo: T, agregadoId: string, datos: DatosDe<T>, operadorId = 'ana'): EventoNuevo {
  reloj += 1;
  return {
    id: crypto.randomUUID(),
    version: 1,
    tipo,
    dispositivoId: DISPOSITIVO,
    operadorId,
    autorizadoPorId: null,
    motivoId: null,
    motivoTexto: null,
    creadoEnDispositivo: new Date(Date.UTC(2026, 9, 28, 20, 0, reloj)).toISOString(),
    agregadoId,
    datos,
  } as EventoNuevo;
}

const abrir = (cuentaId: string, mesaId: string | null = MESA, comensales = 2, operador = 'ana') =>
  evento('cuenta_abierta', cuentaId, { tipo: mesaId ? 'mesa' : 'mostrador', mesaId, mozoId: operador, comensales, nombre: null }, operador);

const cargar = (cuentaId: string, itemId: string, precioCentavos = 100_000, cantidad = 1, modificadores: DatosDe<'item_agregado'>['modificadores'] = []) =>
  evento('item_agregado', cuentaId, {
    itemId,
    productoId: PRODUCTO,
    precioId: crypto.randomUUID(),
    nombre: 'Bife de chorizo',
    precioCentavos,
    estacionId: ESTACION,
    cantidad,
    modificadores,
    nota: null,
  });

describe('reducirSalon', () => {
  it('suma ítems con sus modificadores y cantidades', () => {
    const c = crypto.randomUUID();
    const estado = reducirSalon([
      abrir(c),
      cargar(c, crypto.randomUUID(), 1_250_000, 2, [{ modificadorId: crypto.randomUUID(), nombre: 'Papas', precioCentavos: 150_000 }]),
      cargar(c, crypto.randomUUID(), 300_000),
    ]);
    expect(totalCuenta(estado.cuentas.get(c)!)).toBe(2 * 1_400_000 + 300_000);
  });

  it('bajarle la cantidad deja las unidades anuladas en su propia línea, al lado', () => {
    const c = crypto.randomUUID();
    const item = crypto.randomUUID();
    const otro = crypto.randomUUID();
    const estado = reducirSalon([
      abrir(c),
      cargar(c, item, 100_000, 3),
      cargar(c, otro, 50_000),
      evento('items_enviados', c, { envioId: crypto.randomUUID(), itemIds: [item, otro] }),
      evento('item_anulado', c, { itemId: item, cantidad: 2 }),
    ]);
    const cuenta = estado.cuentas.get(c)!;
    const lineas = [...cuenta.items.values()];
    expect(lineas.map((l) => [l.cantidad, l.anulado])).toEqual([
      [1, false],
      [2, true],
      [1, false],
    ]);
    expect(totalCuenta(cuenta)).toBe(100_000 + 50_000);
  });

  it('regalar algunas unidades las deja en cero en su propia línea', () => {
    const c = crypto.randomUUID();
    const item = crypto.randomUUID();
    const estado = reducirSalon([
      abrir(c),
      cargar(c, item, 100_000, 5),
      evento('items_enviados', c, { envioId: crypto.randomUUID(), itemIds: [item] }),
      evento('item_cortesia', c, { itemId: item, cantidad: 2 }),
    ]);
    const cuenta = estado.cuentas.get(c)!;
    expect([...cuenta.items.values()].map((l) => [l.cantidad, l.cortesia])).toEqual([
      [3, false],
      [2, true],
    ]);
    expect(totalCuenta(cuenta)).toBe(300_000);
  });

  it('anular sin cantidad, o con toda, anula el ítem entero', () => {
    const c = crypto.randomUUID();
    const item = crypto.randomUUID();
    const estado = reducirSalon([
      abrir(c),
      cargar(c, item, 100_000, 2),
      evento('items_enviados', c, { envioId: crypto.randomUUID(), itemIds: [item] }),
      evento('item_anulado', c, { itemId: item, cantidad: 2 }),
    ]);
    const cuenta = estado.cuentas.get(c)!;
    expect(cuenta.items.size).toBe(1);
    expect(cuenta.items.get(item)!.anulado).toBe(true);
    expect(totalCuenta(cuenta)).toBe(0);
  });

  it('la marca de que pidió la cuenta se puede levantar', () => {
    const c = crypto.randomUUID();
    const pedida = reducirSalon([abrir(c), evento('cuenta_pedida', c, {})]);
    expect(pedida.cuentas.get(c)!.pidioCuenta).toBe(true);
    const levantada = reducirSalon([abrir(c), evento('cuenta_pedida', c, {}), evento('cuenta_pedida_cancelada', c, {})]);
    expect(levantada.cuentas.get(c)!.pidioCuenta).toBe(false);
  });

  it('cada ítem recuerda su orden, y los de antes quedan sin orden', () => {
    const c = crypto.randomUUID();
    const primera = crypto.randomUUID();
    const segunda = crypto.randomUUID();
    const conOrden = (itemId: string, ordenId: string) => {
      const e = cargar(c, itemId);
      return { ...e, datos: { ...(e.datos as DatosDe<'item_agregado'>), ordenId } } as EventoNuevo;
    };
    const [a, b, viejo] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const cuenta = reducirSalon([abrir(c), conOrden(a, primera), conOrden(b, segunda), cargar(c, viejo)]).cuentas.get(c)!;
    expect([...cuenta.items.values()].map((i) => i.ordenId)).toEqual([primera, segunda, null]);
  });

  it('un ítem enviado no se quita: queda la anomalía', () => {
    const c = crypto.randomUUID();
    const item = crypto.randomUUID();
    const estado = reducirSalon([
      abrir(c),
      cargar(c, item),
      evento('items_enviados', c, { envioId: crypto.randomUUID(), itemIds: [item] }),
      evento('item_quitado', c, { itemId: item }),
    ]);
    expect(estado.cuentas.get(c)!.items.has(item)).toBe(true);
    expect(estado.anomalias).toHaveLength(1);
  });

  it('un borrador sí se quita', () => {
    const c = crypto.randomUUID();
    const item = crypto.randomUUID();
    const estado = reducirSalon([abrir(c), cargar(c, item), evento('item_quitado', c, { itemId: item })]);
    expect(estado.cuentas.get(c)!.items.size).toBe(0);
  });

  it('dos mozos que abren la misma mesa sin red quedan como dos cuentas en la mesa', () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const estado = reducirSalon([abrir(a, MESA, 2, 'ana'), abrir(b, MESA, 3, 'beto')]);
    expect(vistaDeMesas(estado).get(MESA)!.cuentas).toHaveLength(2);
  });

  it('un evento repetido no duplica el ítem', () => {
    const c = crypto.randomUUID();
    const carga = cargar(c, crypto.randomUUID());
    const estado = reducirSalon([abrir(c), carga, carga]);
    expect(estado.cuentas.get(c)!.items.size).toBe(1);
  });

  it('unir pasa ítems y comensales y deja la de origen unida', () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const estado = reducirSalon([
      abrir(a, MESA, 2),
      abrir(b, OTRA_MESA, 3),
      cargar(b, crypto.randomUUID()),
      evento('cuentas_unidas', a, { cuentaOrigenId: b }),
    ]);
    expect(estado.cuentas.get(a)!.items.size).toBe(1);
    expect(estado.cuentas.get(a)!.comensales).toBe(5);
    expect(estado.cuentas.get(b)!.estado).toBe('unida');
    expect(vistaDeMesas(estado).has(OTRA_MESA)).toBe(false);
  });

  it('marca lo cargado después de la precuenta y la mesa deja de figurar con precuenta', () => {
    const c = crypto.randomUUID();
    const estado = reducirSalon([
      abrir(c),
      cargar(c, crypto.randomUUID()),
      evento('precuenta_emitida', c, { precuentaId: crypto.randomUUID(), totalCentavos: 100_000 }),
    ]);
    expect(vistaDeMesas(estado).get(MESA)!.estado).toBe('precuenta');

    const despues = reducirSalon([
      abrir(c),
      cargar(c, crypto.randomUUID()),
      evento('precuenta_emitida', c, { precuentaId: crypto.randomUUID(), totalCentavos: 100_000 }),
      cargar(c, crypto.randomUUID()),
    ]);
    const cuenta = despues.cuentas.get(c)!;
    expect(cuenta.cambiosTrasPrecuenta).toBe(1);
    expect([...cuenta.items.values()].filter((i) => i.trasPrecuenta)).toHaveLength(1);
    expect(vistaDeMesas(despues).get(MESA)!.estado).toBe('ocupada');
  });

  it('pasar ítems los mueve de cuenta sin perderlos', () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const item = crypto.randomUUID();
    const estado = reducirSalon([
      abrir(a),
      abrir(b, null, 1),
      cargar(a, item),
      evento('items_transferidos', a, { cuentaDestinoId: b, itemIds: [item] }),
    ]);
    expect(estado.cuentas.get(a)!.items.size).toBe(0);
    expect(estado.cuentas.get(b)!.items.has(item)).toBe(true);
  });

  it('un evento sobre una cuenta que no existe queda como anomalía', () => {
    const estado = reducirSalon([cargar(crypto.randomUUID(), crypto.randomUUID())]);
    expect(estado.anomalias[0]!.detalle).toBe('La cuenta no existe');
  });
});
