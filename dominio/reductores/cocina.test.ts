import { describe, expect, it } from 'vitest';
import type { DatosDe, EventoNuevo, TipoEvento } from '../eventos';
import { claveComanda, comandaDemorada, itemsListos, reducirCocina } from './cocina';

const DISPOSITIVO = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';
const PARRILLA = '44444444-4444-4444-8444-444444444444';
const BARRA = '55555555-5555-4555-8555-555555555555';
const CUENTA = '66666666-6666-4666-8666-666666666666';

function evento<T extends TipoEvento>(tipo: T, datos: DatosDe<T>, momento = '2026-10-28T20:00:00.000Z'): EventoNuevo {
  return {
    id: crypto.randomUUID(),
    version: 1,
    tipo,
    dispositivoId: DISPOSITIVO,
    operadorId: 'ana',
    autorizadoPorId: null,
    motivoId: null,
    motivoTexto: null,
    creadoEnDispositivo: momento,
    agregadoId: CUENTA,
    datos,
  } as EventoNuevo;
}

const cargar = (itemId: string, estacionId: string, nombre: string) =>
  evento('item_agregado', {
    itemId,
    productoId: crypto.randomUUID(),
    precioId: crypto.randomUUID(),
    nombre,
    precioCentavos: 100,
    estacionId,
    cantidad: 1,
    modificadores: [],
    nota: null,
  });

describe('reducirCocina', () => {
  it('parte un envío por estación', () => {
    const bife = crypto.randomUUID();
    const vino = crypto.randomUUID();
    const envio = crypto.randomUUID();
    const comandas = reducirCocina([
      cargar(bife, PARRILLA, 'Bife'),
      cargar(vino, BARRA, 'Malbec'),
      evento('items_enviados', { envioId: envio, itemIds: [bife, vino] }),
    ]);
    expect(comandas.size).toBe(2);
    expect(comandas.get(claveComanda(envio, PARRILLA))!.items.map((i) => i.nombre)).toEqual(['Bife']);
  });

  it('lo que no se envió no aparece en cocina', () => {
    const comandas = reducirCocina([cargar(crypto.randomUUID(), PARRILLA, 'Bife')]);
    expect(comandas.size).toBe(0);
  });

  it('pasa por preparación y lista, y se puede reabrir', () => {
    const bife = crypto.randomUUID();
    const envio = crypto.randomUUID();
    const base = [cargar(bife, PARRILLA, 'Bife'), evento('items_enviados', { envioId: envio, itemIds: [bife] })];
    const lista = reducirCocina([...base, evento('comanda_iniciada', { envioId: envio, estacionId: PARRILLA }), evento('comanda_lista', { envioId: envio, estacionId: PARRILLA })]);
    expect(lista.get(claveComanda(envio, PARRILLA))!.estado).toBe('lista');
    expect(itemsListos(lista).has(bife)).toBe(true);

    const reabierta = reducirCocina([
      ...base,
      evento('comanda_lista', { envioId: envio, estacionId: PARRILLA }),
      evento('comanda_reabierta', { envioId: envio, estacionId: PARRILLA }),
    ]);
    expect(reabierta.get(claveComanda(envio, PARRILLA))!.estado).toBe('en_preparacion');
  });

  it('una comanda sin terminar a los 20 minutos está demorada', () => {
    const bife = crypto.randomUUID();
    const envio = crypto.randomUUID();
    const comandas = reducirCocina([cargar(bife, PARRILLA, 'Bife'), evento('items_enviados', { envioId: envio, itemIds: [bife] }, '2026-10-28T20:00:00.000Z')]);
    const comanda = comandas.get(claveComanda(envio, PARRILLA))!;
    expect(comandaDemorada(comanda, Date.parse('2026-10-28T20:15:00.000Z'))).toBe(false);
    expect(comandaDemorada(comanda, Date.parse('2026-10-28T20:21:00.000Z'))).toBe(true);
  });
});
