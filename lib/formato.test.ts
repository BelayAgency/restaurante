import { describe, expect, it } from 'vitest';
import { centavosDesdeTexto, fechaCorta, nombrePeriodo, pesosDesdeCentavos, textoDesdeCentavos } from './formato';

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

describe('centavos y texto', () => {
  it('va y vuelve sin perder un centavo', () => {
    expect(centavosDesdeTexto('1234,5')).toBe(123450);
    expect(centavosDesdeTexto('1234')).toBe(123400);
    expect(centavosDesdeTexto('0,07')).toBe(7);
    expect(centavosDesdeTexto('')).toBeNull();
    expect(centavosDesdeTexto('12,345')).toBeNull();
    expect(textoDesdeCentavos(123450)).toBe('1234,50');
  });
});
