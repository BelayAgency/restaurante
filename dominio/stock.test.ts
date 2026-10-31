import { describe, expect, it } from 'vitest';
import { cantidadBruta, consumoDeReceta, costoPorcion, costoPromedio, factorDeConversion, foodCostPorcentaje } from './stock';

describe('recetas', () => {
  it('con merma hace falta más bruto que neto', () => {
    expect(cantidadBruta({ insumoId: 'carne', cantidad: 300, mermaPorcentaje: 25 })).toBeCloseTo(400);
  });

  it('el consumo escala con las porciones y el rendimiento', () => {
    const lineas = [
      { insumoId: 'harina', cantidad: 1000, mermaPorcentaje: 0 },
      { insumoId: 'agua', cantidad: 600, mermaPorcentaje: 0 },
    ];
    // La receta rinde 10 porciones: vender 3 consume 3/10 de la receta.
    const consumo = consumoDeReceta(lineas, 10, 3);
    expect(consumo.get('harina')).toBeCloseTo(300);
    expect(consumo.get('agua')).toBeCloseTo(180);
  });

  it('costo de la porción y food cost', () => {
    const costo = costoPorcion([{ insumoId: 'carne', cantidad: 300, mermaPorcentaje: 25 }], 1, () => 2.5);
    expect(costo).toBeCloseTo(1000);
    expect(foodCostPorcentaje(costo, 4000)).toBeCloseTo(25);
    expect(foodCostPorcentaje(costo, 0)).toBeNull();
  });
});

describe('costoPromedio', () => {
  it('pondera lo que había con lo que entra', () => {
    expect(costoPromedio(1000, 2, 1000, 4)).toBeCloseTo(3);
  });

  it('sin stock previo manda la compra', () => {
    expect(costoPromedio(0, 2, 500, 4)).toBe(4);
    expect(costoPromedio(-200, 2, 500, 4)).toBe(4);
  });
});

describe('cambio de medida', () => {
  const botella = { unidad: 'u' as const, contenidoPorUnidad: null };
  const enMl = { unidad: 'ml' as const, contenidoPorUnidad: 750 };

  it('de unidades a ml multiplica por lo que trae cada una', () => {
    expect(factorDeConversion(botella, enMl)).toBe(750);
    expect(factorDeConversion(enMl, botella)).toBeCloseTo(1 / 750);
  });

  it('entre dos medidas con composición pasa por la unidad', () => {
    expect(factorDeConversion(enMl, { unidad: 'parte', contenidoPorUnidad: 5 })).toBeCloseTo(5 / 750);
  });

  it('la misma medida no cambia nada, aunque cambie lo que trae', () => {
    expect(factorDeConversion(enMl, { unidad: 'ml', contenidoPorUnidad: 1000 })).toBe(1);
  });

  it('sin composición no hay cuenta: ml a g depende de qué sea', () => {
    expect(factorDeConversion({ unidad: 'ml', contenidoPorUnidad: null }, { unidad: 'g', contenidoPorUnidad: 500 })).toBeNull();
  });
});
