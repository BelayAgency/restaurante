const MILES = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/**
 * `4850000` → `$ 48.500,00`. Los importes viajan en centavos enteros y se
 * formatean separando los dos últimos dígitos: dividir por 100 en un float
 * puede mostrar un importe que no es el que se cobró.
 */
export function pesosDesdeCentavos(centavos: number): string {
  const negativo = centavos < 0;
  const absoluto = Math.abs(Math.trunc(centavos));
  const resto = absoluto % 100;
  const enteros = (absoluto - resto) / 100;
  return `${negativo ? '-' : ''}$ ${MILES.format(enteros)},${String(resto).padStart(2, '0')}`;
}

/** `2026-09-01` → `01/09/2026`, sin pasar por Date (no hay zona horaria que la corra un día). */
export function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** `2026-09` → `septiembre 2026`. */
export function nombrePeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-');
  return `${MESES[Number(mes) - 1] ?? mes} ${anio}`;
}

const FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function fechaHora(momento: Date | string): string {
  return FECHA_HORA.format(typeof momento === 'string' ? new Date(momento) : momento);
}

/** `1234,5` (lo que entrega CampoNumero) → `123450`. Sin floats: se separa el texto. `null` si no es un importe. */
export function centavosDesdeTexto(limpio: string): number | null {
  if (!/^\d+(,\d{0,2})?$/.test(limpio)) return null;
  const [enteros, decimales = ''] = limpio.split(',');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

/** `123450` → `1234,50`, el formato que recibe CampoNumero. */
export function textoDesdeCentavos(centavos: number): string {
  const resto = centavos % 100;
  return `${(centavos - resto) / 100},${String(resto).padStart(2, '0')}`;
}
