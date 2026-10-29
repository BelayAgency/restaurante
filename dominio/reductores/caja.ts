import type { DatosDe, EventoNuevo } from '../eventos';

/**
 * Los turnos de caja, derivados de sus eventos y de los cobros que se les
 * imputaron. Lo esperado sale de acá; lo declarado, del arqueo ciego. La
 * diferencia es la que nunca ve el cajero antes de contar.
 */

type Pago = DatosDe<'cobro_registrado'>['pagos'][number];

export interface Salida {
  id: string;
  tipo: 'retiro' | 'egreso';
  montoCentavos: number;
  motivo: string;
  momento: string;
  operadorId: string;
}

export interface TotalMedio {
  medioId: string;
  nombre: string;
  efectivo: boolean;
  esperadoCentavos: number;
  declaradoCentavos: number | null;
}

export interface Turno {
  id: string;
  abiertoPor: string;
  abiertoEn: string;
  fondoCentavos: number;
  cobros: number;
  consumoCentavos: number;
  propinasCentavos: number;
  /** Lo cobrado por medio, sin el fondo ni las salidas. */
  porMedio: Map<string, { nombre: string; efectivo: boolean; montoCentavos: number }>;
  salidas: Salida[];
  cerradoEn: string | null;
  cerradoPor: string | null;
  declarado: Pago[] | null;
}

export interface EstadoCaja {
  turnos: Map<string, Turno>;
  /** Cobros imputados a un turno que no existe o que ya estaba cerrado. */
  cobrosHuerfanos: string[];
}

export function reducirCaja(eventos: Iterable<EventoNuevo>): EstadoCaja {
  const turnos = new Map<string, Turno>();
  const cobrosHuerfanos: string[] = [];
  const cobrosVistos = new Set<string>();

  for (const evento of eventos) {
    switch (evento.tipo) {
      case 'turno_abierto':
        if (turnos.has(evento.agregadoId)) break;
        turnos.set(evento.agregadoId, {
          id: evento.agregadoId,
          abiertoPor: evento.operadorId,
          abiertoEn: evento.creadoEnDispositivo,
          fondoCentavos: evento.datos.fondoCentavos,
          cobros: 0,
          consumoCentavos: 0,
          propinasCentavos: 0,
          porMedio: new Map(),
          salidas: [],
          cerradoEn: null,
          cerradoPor: null,
          declarado: null,
        });
        break;
      case 'salida_caja': {
        const turno = turnos.get(evento.agregadoId);
        if (!turno || turno.cerradoEn || turno.salidas.some((s) => s.id === evento.datos.salidaId)) break;
        turno.salidas.push({
          id: evento.datos.salidaId,
          tipo: evento.datos.tipo,
          montoCentavos: evento.datos.montoCentavos,
          motivo: evento.datos.motivo,
          momento: evento.creadoEnDispositivo,
          operadorId: evento.operadorId,
        });
        break;
      }
      case 'turno_cerrado': {
        const turno = turnos.get(evento.agregadoId);
        if (!turno || turno.cerradoEn) break;
        turno.cerradoEn = evento.creadoEnDispositivo;
        turno.cerradoPor = evento.operadorId;
        turno.declarado = evento.datos.declarado;
        break;
      }
      case 'cobro_registrado': {
        const d = evento.datos;
        if (cobrosVistos.has(d.cobroId)) break;
        cobrosVistos.add(d.cobroId);
        const turno = turnos.get(d.turnoId);
        if (!turno || turno.cerradoEn) {
          cobrosHuerfanos.push(d.cobroId);
          break;
        }
        turno.cobros += 1;
        turno.consumoCentavos += d.consumoCentavos;
        turno.propinasCentavos += d.propinaCentavos;
        for (const p of d.pagos) {
          const actual = turno.porMedio.get(p.medioId) ?? { nombre: p.nombre, efectivo: p.efectivo, montoCentavos: 0 };
          actual.montoCentavos += p.montoCentavos;
          turno.porMedio.set(p.medioId, actual);
        }
        break;
      }
    }
  }
  return { turnos, cobrosHuerfanos };
}

export function turnoAbierto(estado: EstadoCaja): Turno | null {
  for (const turno of estado.turnos.values()) if (!turno.cerradoEn) return turno;
  return null;
}

/**
 * Lo esperado por medio frente a lo declarado. En efectivo, lo esperado
 * incluye el fondo inicial y descuenta retiros y egresos.
 */
export function arqueo(turno: Turno, mediosConocidos: { id: string; nombre: string; efectivo: boolean }[]): TotalMedio[] {
  const filas = new Map<string, TotalMedio>();
  for (const m of mediosConocidos) filas.set(m.id, { medioId: m.id, nombre: m.nombre, efectivo: m.efectivo, esperadoCentavos: 0, declaradoCentavos: null });
  for (const [id, m] of turno.porMedio) {
    const fila = filas.get(id) ?? { medioId: id, nombre: m.nombre, efectivo: m.efectivo, esperadoCentavos: 0, declaradoCentavos: null };
    fila.esperadoCentavos += m.montoCentavos;
    filas.set(id, fila);
  }
  const efectivo = [...filas.values()].find((f) => f.efectivo);
  if (efectivo) {
    efectivo.esperadoCentavos += turno.fondoCentavos - turno.salidas.reduce((s, x) => s + x.montoCentavos, 0);
  }
  for (const d of turno.declarado ?? []) {
    const fila = filas.get(d.medioId) ?? { medioId: d.medioId, nombre: d.nombre, efectivo: d.efectivo, esperadoCentavos: 0, declaradoCentavos: null };
    fila.declaradoCentavos = (fila.declaradoCentavos ?? 0) + d.montoCentavos;
    filas.set(d.medioId, fila);
  }
  return [...filas.values()];
}

export function diferenciaTotal(filas: TotalMedio[]): number {
  return filas.reduce((s, f) => s + ((f.declaradoCentavos ?? 0) - f.esperadoCentavos), 0);
}
