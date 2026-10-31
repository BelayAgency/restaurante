import { describe, expect, it } from 'vitest';
import { correrDia, datosReserva, diaLocal, horaLocal, momentoReserva } from './reservas';

describe('reservas', () => {
  it('una reserva a las 21 en Buenos Aires es medianoche UTC', () => {
    expect(momentoReserva('2026-10-30', '21:00').toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('el día y la hora del local salen en Buenos Aires, no en UTC', () => {
    const momento = momentoReserva('2026-10-30', '23:30');
    expect(diaLocal(momento)).toBe('2026-10-30');
    expect(horaLocal(momento)).toBe('23:30');
  });

  it('correr el día cruza meses y años', () => {
    expect(correrDia('2026-10-31', 1)).toBe('2026-11-01');
    expect(correrDia('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('el teléfono y la nota vacíos quedan en null', () => {
    const datos = datosReserva.parse({ id: null, nombreCliente: 'Ana', telefono: '', personas: 4, fecha: '2026-10-30', hora: '21:15', nota: '  ' });
    expect(datos.telefono).toBeNull();
    expect(datos.nota).toBeNull();
  });

  it('rechaza un nombre con forma de link y una hora inválida', () => {
    const base = { id: null, telefono: null, personas: 2, fecha: '2026-10-30', nota: null };
    expect(datosReserva.safeParse({ ...base, nombreCliente: 'www.estafa.com', hora: '21:00' }).success).toBe(false);
    expect(datosReserva.safeParse({ ...base, nombreCliente: 'Ana', hora: '25:00' }).success).toBe(false);
  });
});
