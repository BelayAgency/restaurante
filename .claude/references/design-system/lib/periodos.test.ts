import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cambiarTipo, correr, leerPeriodo, valorRango } from './periodos';

/**
 * La aritmética de fechas del filtro por período.
 *
 * Se prueba a conciencia porque es donde vive el error que nadie ve: un día de
 * más en el límite de un mes deja un gasto afuera del balance y nada avisa. Los
 * casos elegidos son los que rompen: febrero, los meses de 30, el cambio de
 * año, la semana que cruza de mes y el domingo.
 */

describe('el mes', () => {
  it('va del primero al último día', () => {
    const p = leerPeriodo('mes', '2026-09');
    expect(p).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30' });
  });

  it('febrero de un año común y de uno bisiesto', () => {
    expect(leerPeriodo('mes', '2026-02').hasta).toBe('2026-02-28');
    // 2028 es bisiesto: si el cálculo usara una tabla fija, acá daría 28.
    expect(leerPeriodo('mes', '2028-02').hasta).toBe('2028-02-29');
  });

  it('diciembre pasa a enero del año siguiente', () => {
    expect(correr(leerPeriodo('mes', '2026-12'), 1)).toBe('2027-01');
    expect(correr(leerPeriodo('mes', '2027-01'), -1)).toBe('2026-12');
  });

  it('se lee con el nombre del mes', () => {
    expect(leerPeriodo('mes', '2026-09').etiqueta).toBe('Septiembre de 2026');
  });
});

describe('la semana', () => {
  it('empieza el lunes y termina el domingo', () => {
    // El 23/9/2026 es miércoles.
    const p = leerPeriodo('semana', '2026-09-23');
    expect(p).toMatchObject({ desde: '2026-09-21', hasta: '2026-09-27', valor: '2026-09-21' });
  });

  it('un domingo pertenece a la semana que termina, no a la que empieza', () => {
    // El caso que rompe con `getUTCDay()` sin corregir: domingo es 0 y la
    // semana se corría siete días hacia adelante.
    const p = leerPeriodo('semana', '2026-09-27');
    expect(p.desde).toBe('2026-09-21');
    expect(p.hasta).toBe('2026-09-27');
  });

  it('cruzando el fin de mes se nombran los dos meses', () => {
    const p = leerPeriodo('semana', '2026-09-30');
    expect(p.desde).toBe('2026-09-28');
    expect(p.hasta).toBe('2026-10-04');
    expect(p.etiqueta).toBe('28 sept – 4 oct 2026');
  });

  it('cruzando el fin de año se nombran los dos años', () => {
    const p = leerPeriodo('semana', '2026-12-31');
    expect(p.desde).toBe('2026-12-28');
    expect(p.hasta).toBe('2027-01-03');
    expect(p.etiqueta).toBe('28 dic 2026 – 3 ene 2027');
  });

  it('dentro del mismo mes no se repite el mes', () => {
    expect(leerPeriodo('semana', '2026-09-23').etiqueta).toBe('21 – 27 sept 2026');
  });

  it('avanza de a siete días', () => {
    expect(correr(leerPeriodo('semana', '2026-09-21'), 1)).toBe('2026-09-28');
    expect(correr(leerPeriodo('semana', '2026-09-21'), -1)).toBe('2026-09-14');
  });
});

describe('el año', () => {
  it('va del 1 de enero al 31 de diciembre', () => {
    expect(leerPeriodo('anio', '2026')).toMatchObject({
      desde: '2026-01-01',
      hasta: '2026-12-31',
      etiqueta: '2026',
    });
  });

  it('avanza de a uno', () => {
    expect(correr(leerPeriodo('anio', '2026'), 1)).toBe('2027');
  });
});

describe('cambiar de lupa', () => {
  // Hoy se fija porque la regla depende de él: es miércoles 23/9/2026.
  beforeAll(() => vi.useFakeTimers({ now: new Date('2026-09-23T12:00:00.000Z') }));
  afterAll(() => vi.useRealTimers());

  it('de un mes pasado a semanas cae en la primera semana de ESE mes', () => {
    // Abril de 2026 empieza un miércoles: la primera semana es la del lunes 6,
    // no la del 30 de marzo. Apretar «Por semana» estando en abril y que diga
    // «30 mar – 5 abr» es lo que nadie espera leer.
    expect(cambiarTipo(leerPeriodo('mes', '2026-04'), 'semana')).toBe('2026-04-06');
  });

  it('de un mes pasado a años se queda en su año', () => {
    expect(cambiarTipo(leerPeriodo('mes', '2026-04'), 'anio')).toBe('2026');
  });

  it('de un año pasado a meses cae en enero, y a semanas en su primera semana', () => {
    // 2025 arranca un miércoles: el primer lunes es el 6.
    expect(cambiarTipo(leerPeriodo('anio', '2025'), 'mes')).toBe('2025-01');
    expect(cambiarTipo(leerPeriodo('anio', '2025'), 'semana')).toBe('2025-01-06');
  });

  it('del año corriente cae en hoy, no en enero', () => {
    // Estando parado en 2026 entero, el mes que importa es el que estamos
    // viviendo: enero es un lugar donde no está pasando nada.
    expect(cambiarTipo(leerPeriodo('anio', '2026'), 'mes')).toBe('2026-09');
    expect(cambiarTipo(leerPeriodo('anio', '2026'), 'semana')).toBe('2026-09-21');
  });

  it('del mes corriente a semanas cae en la semana de hoy', () => {
    expect(cambiarTipo(leerPeriodo('mes', '2026-09'), 'semana')).toBe('2026-09-21');
  });

  it('de semana a mes toma el mes del lunes', () => {
    const semana = leerPeriodo('semana', '2026-09-30');
    expect(semana.desde).toBe('2026-09-28');
    expect(cambiarTipo(semana, 'mes')).toBe('2026-09');
  });

  it('a la misma lupa no se mueve', () => {
    const marzo = leerPeriodo('mes', '2026-03');
    expect(cambiarTipo(marzo, 'mes')).toBe('2026-03');
  });
});

describe('lo que llega roto', () => {
  it('un valor sin sentido cae en el mes corriente en vez de romper', () => {
    // La pantalla se abre con un enlace: uno viejo o tocado a mano no puede
    // dejar a nadie mirando un error.
    for (const basura of ['', 'ayer', '2026-99', '99999']) {
      const p = leerPeriodo('mes', basura);
      expect(p.tipo).toBe('mes');
      expect(p.desde).toMatch(/^\d{4}-\d{2}-01$/);
    }
  });

  it('un tipo desconocido cae en mes', () => {
    expect(leerPeriodo('quincena', '2026-09').tipo).toBe('mes');
  });
});

describe('el rango', () => {
  it('va de la primera a la última fecha, las dos inclusive', () => {
    const p = leerPeriodo('rango', '2026-09-03_2026-09-18');
    expect(p).toMatchObject({
      tipo: 'rango',
      desde: '2026-09-03',
      hasta: '2026-09-18',
      etiqueta: '3 – 18 sept 2026',
    });
  });

  it('cruza de mes y de año con el nombre de los dos lados', () => {
    expect(leerPeriodo('rango', '2026-12-28_2027-01-03').etiqueta).toBe('28 dic 2026 – 3 ene 2027');
  });

  it('un solo día se lee como un día', () => {
    expect(leerPeriodo('rango', '2026-09-05_2026-09-05').etiqueta).toBe('5 sept 2026');
  });

  it('con las fechas al revés las ordena en vez de dar un rango vacío', () => {
    expect(leerPeriodo('rango', '2026-09-18_2026-09-03')).toMatchObject({
      desde: '2026-09-03',
      hasta: '2026-09-18',
    });
    expect(valorRango('2026-09-18', '2026-09-03')).toBe('2026-09-03_2026-09-18');
  });

  it('una fecha que no existe cae en el mes corriente', () => {
    for (const roto of ['2026-02-31_2026-03-05', '2026-09-03', 'ayer_hoy', '']) {
      expect(leerPeriodo('rango', roto).tipo).toBe('mes');
    }
  });

  it('se corre de a su propio largo, sin superponerse', () => {
    const p = leerPeriodo('rango', '2026-09-11_2026-09-20'); // 10 días
    expect(correr(p, 1)).toBe('2026-09-21_2026-09-30');
    expect(correr(p, -1)).toBe('2026-09-01_2026-09-10');
  });

  it('pasar a rango conserva lo que se estaba mirando', () => {
    expect(cambiarTipo(leerPeriodo('mes', '2026-02'), 'rango')).toBe('2026-02-01_2026-02-28');
  });
});
