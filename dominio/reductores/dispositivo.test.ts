import { describe, expect, it } from 'vitest';
import type { EventoNuevo } from '../eventos';
import { pinBloqueado, reducirDispositivo } from './dispositivo';

const DISPOSITIVO = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';

function evento(parcial: Pick<EventoNuevo, 'tipo' | 'datos' | 'operadorId'> & { creadoEnDispositivo?: string }): EventoNuevo {
  return {
    id: crypto.randomUUID(),
    version: 1,
    dispositivoId: DISPOSITIVO,
    agregadoId: DISPOSITIVO,
    autorizadoPorId: null,
    motivoId: null,
    motivoTexto: null,
    creadoEnDispositivo: parcial.creadoEnDispositivo ?? '2026-10-28T20:00:00.000Z',
    ...parcial,
  } as EventoNuevo;
}

describe('reducirDispositivo', () => {
  it('el operador es el del último cambio', () => {
    const estado = reducirDispositivo([
      evento({ tipo: 'operador_cambiado', operadorId: 'ana', datos: { operadorAnteriorId: null } }),
      evento({ tipo: 'operador_cambiado', operadorId: 'beto', datos: { operadorAnteriorId: 'ana' } }),
    ]);
    expect(estado.operadorId).toBe('beto');
  });

  it('bloquea a la quinta falla reciente y un cambio exitoso limpia el contador', () => {
    const fallas = Array.from({ length: 5 }, () => evento({ tipo: 'pin_fallido', operadorId: 'ana', datos: { usuarioIntentadoId: 'beto' } }));
    const ahora = new Date('2026-10-28T20:01:00.000Z');
    expect(pinBloqueado(reducirDispositivo(fallas), 'beto', ahora)).toBe(true);
    expect(pinBloqueado(reducirDispositivo(fallas.slice(0, 4)), 'beto', ahora)).toBe(false);
    const conCambio = [...fallas, evento({ tipo: 'operador_cambiado', operadorId: 'beto', datos: { operadorAnteriorId: 'ana' } })];
    expect(pinBloqueado(reducirDispositivo(conCambio), 'beto', ahora)).toBe(false);
  });

  it('las fallas viejas no cuentan', () => {
    const fallas = Array.from({ length: 5 }, () =>
      evento({ tipo: 'pin_fallido', operadorId: 'ana', datos: { usuarioIntentadoId: 'beto' }, creadoEnDispositivo: '2026-10-28T19:00:00.000Z' }),
    );
    expect(pinBloqueado(reducirDispositivo(fallas), 'beto', new Date('2026-10-28T20:00:00.000Z'))).toBe(false);
  });
});
