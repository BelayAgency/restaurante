/**
 * El período que mira una pantalla con balance: una semana, un mes o un año.
 *
 * Todo acá es aritmética de fechas pura, sin base ni red, porque es donde se
 * esconden los errores de este tipo de código: el mes que tiene 28 días, la
 * semana que cruza el fin de año, el día que se corre uno por la zona horaria.
 * Por eso se calcula TODO en UTC y se devuelve `YYYY-MM-DD`, que es el formato
 * de las columnas `date` de la base — pasar por `Date` local haría que un gasto
 * del día 1 a las 00:30 de Argentina cayera en el mes anterior.
 *
 * La semana va de lunes a domingo, como se cuenta acá. El rango es libre: dos
 * fechas elegidas a mano, inclusive las dos.
 */

export type TipoPeriodo = 'semana' | 'mes' | 'anio' | 'rango';

export const TIPOS: { tipo: TipoPeriodo; etiqueta: string }[] = [
  { tipo: 'semana', etiqueta: 'Por semana' },
  { tipo: 'mes', etiqueta: 'Por mes' },
  { tipo: 'anio', etiqueta: 'Por año' },
  { tipo: 'rango', etiqueta: 'Rango' },
];

export interface Periodo {
  tipo: TipoPeriodo;
  /** Lo que va en la URL: `2026-09-21` (lunes), `2026-09`, `2026` o, en un rango, `2026-09-03_2026-09-18`. */
  valor: string;
  /** Primer día, inclusive. `YYYY-MM-DD`. */
  desde: string;
  /** Último día, inclusive. `YYYY-MM-DD`. */
  hasta: string;
  /** Cómo se lee: «22 – 28 sept 2026», «Septiembre de 2026», «2026», «3 – 18 sept 2026». */
  etiqueta: string;
}

const DIA = 86_400_000;

function aIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** El lunes de la semana en la que cae esa fecha. */
function lunesDe(d: Date): Date {
  // `getUTCDay()` da 0 para domingo; se lo trata como el día 7 para que la
  // semana empiece el lunes y no se corra una hacia adelante.
  const dia = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return new Date(d.getTime() - (dia - 1) * DIA);
}

function hoyUtc(): Date {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
}

/**
 * Arma el período a partir de lo que vino en la URL.
 *
 * Cualquier cosa que no se entienda cae en el mes corriente en vez de romper:
 * es una pantalla que se abre con un enlace, y un enlace viejo o tocado a mano
 * no puede dejar a nadie mirando un error.
 */
export function leerPeriodo(tipo?: string, valor?: string): Periodo {
  const t: TipoPeriodo =
    tipo === 'semana' || tipo === 'anio' || tipo === 'rango' ? tipo : 'mes';

  if (t === 'rango') {
    const r = leerRango(valor);
    if (r) return r;
    // Un rango roto cae en el mes corriente, como cualquier otro valor inválido.
    return leerPeriodo('mes');
  }

  if (t === 'anio') {
    const anio = /^\d{4}$/.test(valor ?? '') ? Number(valor) : hoyUtc().getUTCFullYear();
    return {
      tipo: 'anio',
      valor: String(anio),
      desde: `${anio}-01-01`,
      hasta: `${anio}-12-31`,
      etiqueta: String(anio),
    };
  }

  if (t === 'semana') {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(valor ?? '')
      ? new Date(`${valor}T00:00:00.000Z`)
      : hoyUtc();
    const lunes = lunesDe(Number.isNaN(base.getTime()) ? hoyUtc() : base);
    const domingo = new Date(lunes.getTime() + 6 * DIA);
    return {
      tipo: 'semana',
      valor: aIso(lunes),
      desde: aIso(lunes),
      hasta: aIso(domingo),
      etiqueta: etiquetaSemana(lunes, domingo),
    };
  }

  const coincide = /^(\d{4})-(\d{2})$/.exec(valor ?? '');
  const hoy = hoyUtc();
  const anio = coincide ? Number(coincide[1]) : hoy.getUTCFullYear();
  const mes = coincide ? Number(coincide[2]) : hoy.getUTCMonth() + 1;

  // Día 0 del mes siguiente es el último del pedido, sin tabla de días.
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, '0');

  return {
    tipo: 'mes',
    valor: `${anio}-${mm}`,
    desde: `${anio}-${mm}-01`,
    hasta: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}`,
    etiqueta: etiquetaMes(anio, mes),
  };
}

/** Un día `YYYY-MM-DD` que existe de verdad: `2026-02-31` no pasa. */
function diaValido(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || aIso(d) !== iso ? null : d;
}

/** Arma el `valor` de un rango. Si las fechas vienen al revés, las ordena. */
export function valorRango(desde: string, hasta: string): string {
  return desde <= hasta ? `${desde}_${hasta}` : `${hasta}_${desde}`;
}

function leerRango(valor?: string): Periodo | null {
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(valor ?? '');
  if (!m) return null;

  // Un enlace tocado a mano puede traer las fechas al revés: se ordenan en vez
  // de mostrar un rango vacío.
  const [desde, hasta] = [m[1]!, m[2]!].sort();
  const a = diaValido(desde!);
  const b = diaValido(hasta!);
  if (!a || !b) return null;

  return {
    tipo: 'rango',
    valor: `${desde}_${hasta}`,
    desde: desde!,
    hasta: hasta!,
    etiqueta: etiquetaRango(a, b),
  };
}

/**
 * El período de al lado, hacia atrás o hacia adelante. Devuelve el `valor`.
 *
 * El rango se corre de a su propio largo: si se miraron 10 días, «siguiente»
 * son los 10 días que le siguen, sin superponerse ni dejar huecos.
 */
export function correr(periodo: Periodo, pasos: number): string {
  if (periodo.tipo === 'rango') {
    const desde = new Date(`${periodo.desde}T00:00:00.000Z`);
    const hasta = new Date(`${periodo.hasta}T00:00:00.000Z`);
    const largo = Math.round((hasta.getTime() - desde.getTime()) / DIA) + 1;
    return valorRango(
      aIso(new Date(desde.getTime() + pasos * largo * DIA)),
      aIso(new Date(hasta.getTime() + pasos * largo * DIA)),
    );
  }

  if (periodo.tipo === 'anio') return String(Number(periodo.valor) + pasos);

  if (periodo.tipo === 'semana') {
    const lunes = new Date(`${periodo.valor}T00:00:00.000Z`);
    return aIso(new Date(lunes.getTime() + pasos * 7 * DIA));
  }

  const [anio, mes] = periodo.valor.split('-').map(Number);
  const d = new Date(Date.UTC(anio ?? 2026, (mes ?? 1) - 1 + pasos, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * El mismo momento visto con otra lupa.
 *
 * Dos reglas, y la segunda manda:
 *
 * 1. No se vuelve a hoy porque sí. Si venías mirando abril y pasás a semanas,
 *    caés en la primera semana de abril: cambiaste de lupa, no de lugar.
 * 2. Salvo que hoy esté adentro de lo que estabas mirando. Ahí la lupa nueva
 *    se apoya en hoy, porque es donde estabas parado de verdad: mirando 2026
 *    entero y pasando a meses, el mes que importa es el corriente, no enero.
 *
 * Al achicar la lupa se toma el primer período que EMPIEZA adentro del rango.
 * Si se tomara el que contiene al día 1, «la primera semana de abril» podría
 * llamarse «30 mar – 5 abr», que es exactamente lo que nadie espera leer
 * después de apretar «Por semana» estando en abril.
 */
export function cambiarTipo(periodo: Periodo, nuevo: TipoPeriodo): string {
  if (nuevo === periodo.tipo) return periodo.valor;

  // Pasar a rango conserva exactamente lo que se estaba mirando: es el punto
  // de partida natural para ajustar las fechas a mano.
  if (nuevo === 'rango') return valorRango(periodo.desde, periodo.hasta);

  const hoy = aIso(hoyUtc());
  if (hoy >= periodo.desde && hoy <= periodo.hasta) return leerPeriodo(nuevo).valor;

  const ancla = new Date(`${periodo.desde}T00:00:00.000Z`);

  if (nuevo === 'anio') return String(ancla.getUTCFullYear());

  if (nuevo === 'mes') {
    return `${ancla.getUTCFullYear()}-${String(ancla.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  const lunes = lunesDe(ancla);
  const primero = aIso(lunes) >= periodo.desde ? lunes : new Date(lunes.getTime() + 7 * DIA);
  return aIso(primero);
}

/** ¿Este período ya pasó o está pasando? Se usa para no dejar ir al futuro. */
export function yaEmpezo(valor: string, tipo: TipoPeriodo): boolean {
  return leerPeriodo(tipo, valor).desde <= aIso(hoyUtc());
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sept', 'oct', 'nov', 'dic',
];

function etiquetaMes(anio: number, mes: number): string {
  return `${MESES[mes - 1] ?? mes} de ${anio}`;
}

/** «5 oct 2026» si es un solo día, y si no, igual que una semana. */
function etiquetaRango(desde: Date, hasta: Date): string {
  return aIso(desde) === aIso(hasta)
    ? `${hasta.getUTCDate()} ${MESES_CORTOS[hasta.getUTCMonth()]} ${hasta.getUTCFullYear()}`
    : etiquetaSemana(desde, hasta);
}

/** «22 – 28 sept 2026», y con el mes de los dos lados cuando la semana lo cruza. */
function etiquetaSemana(lunes: Date, domingo: Date): string {
  const mismoMes = lunes.getUTCMonth() === domingo.getUTCMonth();
  const mismoAnio = lunes.getUTCFullYear() === domingo.getUTCFullYear();

  const izq = mismoMes
    ? String(lunes.getUTCDate())
    : `${lunes.getUTCDate()} ${MESES_CORTOS[lunes.getUTCMonth()]}${mismoAnio ? '' : ` ${lunes.getUTCFullYear()}`}`;

  const der = `${domingo.getUTCDate()} ${MESES_CORTOS[domingo.getUTCMonth()]} ${domingo.getUTCFullYear()}`;

  return `${izq} – ${der}`;
}
