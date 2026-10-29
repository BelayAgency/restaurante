import { describe, expect, it } from 'vitest';
import { puedeAdministrarCuenta } from './permisos';

const dueno = { id: 'd', rol: 'dueno' as const, esSoporte: false };
const encargado = { id: 'e', rol: 'encargado' as const, esSoporte: false };
const soporte = { id: 's', rol: 'dueno' as const, esSoporte: true };

describe('puedeAdministrarCuenta', () => {
  it('nadie administra a soporte, ni soporte a sí mismo', () => {
    expect(puedeAdministrarCuenta(dueno, soporte)).toBe(false);
    expect(puedeAdministrarCuenta(soporte, soporte)).toBe(false);
  });

  it('el dueño administra a otro dueño y a un encargado; el encargado no administra usuarios', () => {
    expect(puedeAdministrarCuenta(dueno, { id: 'd2', rol: 'dueno', esSoporte: false })).toBe(true);
    expect(puedeAdministrarCuenta(dueno, encargado)).toBe(true);
    expect(puedeAdministrarCuenta(encargado, { id: 'm', rol: 'mozo', esSoporte: false })).toBe(false);
  });

  it('nadie se administra a sí mismo desde la ficha ajena', () => {
    expect(puedeAdministrarCuenta(dueno, dueno)).toBe(false);
  });
});
