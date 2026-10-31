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
  const cobrosVistos = new Map<string, { turnoId: string; pagos: Pago[] }>();

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
        cobrosVistos.set(d.cobroId, { turnoId: d.turnoId, pagos: d.pagos });
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
      case 'cobro_corregido': {
        // El medio cambia en el turno del cobro original: lo que entró por
        // tarjeta y se corrige a efectivo cambia lo esperado en la caja.
        const original = cobrosVistos.get(evento.datos.cobroId);
        const turno = original ? turnos.get(original.turnoId) : undefined;
        if (!original || !turno) break;
        const suma = (pagos: Pago[]) => pagos.reduce((s, p) => s + p.montoCentavos, 0);
        if (suma(original.pagos) !== suma(evento.datos.pagos)) break;
        for (const [signo, pagos] of [[-1, original.pagos], [1, evento.datos.pagos]] as const) {
          for (const p of pagos) {
            const actual = turno.porMedio.get(p.medioId) ?? { nombre: p.nombre, efectivo: p.efectivo, montoCentavos: 0 };
            actual.montoCentavos += signo * p.montoCentavos;
            turno.porMedio.set(p.medioId, actual);
          }
        }
        original.pagos = evento.datos.pagos;
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

/** Lo mínimo de una cuenta que hace falta para ubicarla en la caja; `Cuenta` del salón lo cumple. */
interface CuentaEnCaja {
  id: string;
  estado: 'abierta' | 'unida' | 'cerrada';
  cerradaEn: string | null;
  mozoId: string;
  cobros: { id: string; turnoId: string; consumoCentavos: number; propinaCentavos: number; cobradoEn: string; cobradoPor: string }[];
}

export type MovimientoCaja =
  | { clase: 'apertura'; id: string; momento: string; operadorId: string; montoCentavos: number }
  | { clase: 'cobro'; id: string; momento: string; operadorId: string; montoCentavos: number; cuentaId: string }
  | { clase: 'sin_cobrar'; id: string; momento: string; operadorId: string; montoCentavos: 0; cuentaId: string }
  | { clase: 'retiro' | 'egreso'; id: string; momento: string; operadorId: string; montoCentavos: number; motivo: string }
  | { clase: 'cierre'; id: string; momento: string; operadorId: string; montoCentavos: number };

/**
 * Todo lo que pasó por una caja, del más nuevo al más viejo: la apertura, cada
 * cobro (con la cuenta de la que salió), los retiros y egresos, el cierre, y
 * las cuentas que se cerraron sin cobrar mientras estaba abierta, que no
 * movieron plata pero son justamente lo que el dueño quiere encontrar. Las
 * salidas restan.
 */
export function movimientosDeTurno(turno: Turno, cuentas: Iterable<CuentaEnCaja>): MovimientoCaja[] {
  const movimientos: MovimientoCaja[] = [{ clase: 'apertura', id: `${turno.id}:apertura`, momento: turno.abiertoEn, operadorId: turno.abiertoPor, montoCentavos: turno.fondoCentavos }];
  const dentro = (momento: string) => momento >= turno.abiertoEn && (!turno.cerradoEn || momento <= turno.cerradoEn);
  for (const cuenta of cuentas) {
    for (const cobro of cuenta.cobros) {
      if (cobro.turnoId !== turno.id) continue;
      movimientos.push({ clase: 'cobro', id: cobro.id, momento: cobro.cobradoEn, operadorId: cobro.cobradoPor, montoCentavos: cobro.consumoCentavos + cobro.propinaCentavos, cuentaId: cuenta.id });
    }
    if (cuenta.estado === 'cerrada' && !cuenta.cobros.length && cuenta.cerradaEn && dentro(cuenta.cerradaEn)) {
      movimientos.push({ clase: 'sin_cobrar', id: `${cuenta.id}:sin_cobrar`, momento: cuenta.cerradaEn, operadorId: cuenta.mozoId, montoCentavos: 0, cuentaId: cuenta.id });
    }
  }
  for (const s of turno.salidas) movimientos.push({ clase: s.tipo, id: s.id, momento: s.momento, operadorId: s.operadorId, montoCentavos: -s.montoCentavos, motivo: s.motivo });
  if (turno.cerradoEn) {
    const declarado = (turno.declarado ?? []).reduce((s, p) => s + p.montoCentavos, 0);
    movimientos.push({ clase: 'cierre', id: `${turno.id}:cierre`, momento: turno.cerradoEn, operadorId: turno.cerradoPor ?? turno.abiertoPor, montoCentavos: declarado });
  }
  return movimientos.sort((a, b) => b.momento.localeCompare(a.momento));
}

export function diferenciaTotal(filas: TotalMedio[]): number {
  return filas.reduce((s, f) => s + ((f.declaradoCentavos ?? 0) - f.esperadoCentavos), 0);
}
