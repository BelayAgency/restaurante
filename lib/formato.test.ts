import { describe, expect, it } from 'vitest';
import { fechaCorta, nombrePeriodo, pesosDesdeCentavos } from './formato';

describe('pesosDesdeCentavos', () => {
  it('separa miles con punto y centavos con coma', () => {
    expect(pesosDesdeCentavos(4850000)).toBe('$ 48.500,00');
    expect(pesosDesdeCentavos(123456)).toBe('$ 1.234,56');
    expect(pesosDesdeCentavos(5)).toBe('$ 0,05');
    expect(pesosDesdeCentavos(0)).toBe('$ 0,00');
  });

  it('respeta el signo', () => {
    expect(pesosDesdeCentavos(-123456)).toBe('-$ 1.234,56');
  });
});

describe('fechas', () => {
  it('da DD/MM/AAAA sin correr el día', () => {
    expect(fechaCorta('2026-09-01')).toBe('01/09/2026');
  });

  it('nombra el período', () => {
    expect(nombrePeriodo('2026-09')).toBe('septiembre 2026');
  });
});
