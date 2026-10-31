import type { ReactNode } from 'react';
import { Banknote, CreditCard } from 'lucide-react';
import type { MedioPago } from '@/dominio/catalogo';
import { arqueo, type Turno } from '@/dominio/reductores/caja';
import { cn } from '@/lib/cn';
import { pesosDesdeCentavos } from '@/lib/formato';

/**
 * Lo que debería haber en la caja, partido en lo que se cuenta en billetes y
 * lo que entró por tarjeta, transferencia o QR; con la caja cerrada, al lado
 * de lo que se declaró. Es lo esperado del arqueo: quien llama lo muestra sólo
 * a quien controla, porque el cajero declara a ciegas.
 */
export function TotalesTurno({ turno, medios }: { turno: Turno; medios: MedioPago[] }) {
  const filas = arqueo(turno, medios);
  const efectivo = filas.find((f) => f.efectivo);
  // Todos los medios, también en cero: como el efectivo, se ve qué hay y qué no.
  const digitales = filas.filter((f) => !f.efectivo);
  const cobradoEfectivo = [...turno.porMedio.values()].filter((m) => m.efectivo).reduce((s, m) => s + m.montoCentavos, 0);
  const salidas = turno.salidas.reduce((s, x) => s + x.montoCentavos, 0);
  const cerrada = turno.cerradoEn !== null;
  const declaradoDigital = digitales.reduce((s, f) => s + (f.declaradoCentavos ?? 0), 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Tarjeta icono={<Banknote size={15} strokeWidth={1.5} />} etiqueta="Efectivo en caja" totalCentavos={efectivo?.esperadoCentavos ?? 0}>
        <Fila etiqueta="Fondo inicial" valor={pesosDesdeCentavos(turno.fondoCentavos)} />
        <Fila etiqueta="Cobrado" valor={pesosDesdeCentavos(cobradoEfectivo)} />
        <Fila etiqueta="Retiros y gastos" valor={salidas ? `− ${pesosDesdeCentavos(salidas)}` : pesosDesdeCentavos(0)} />
        {cerrada && efectivo ? <Declarado esperado={efectivo.esperadoCentavos} declarado={efectivo.declaradoCentavos ?? 0} /> : null}
      </Tarjeta>
      <Tarjeta icono={<CreditCard size={15} strokeWidth={1.5} />} etiqueta="Tarjeta y digital" totalCentavos={digitales.reduce((s, f) => s + f.esperadoCentavos, 0)}>
        {digitales.map((f) => (
          <Fila key={f.medioId} etiqueta={f.nombre} valor={pesosDesdeCentavos(f.esperadoCentavos)} />
        ))}
        {cerrada && digitales.length ? <Declarado esperado={digitales.reduce((s, f) => s + f.esperadoCentavos, 0)} declarado={declaradoDigital} /> : null}
      </Tarjeta>
    </div>
  );
}

function Tarjeta({ icono, etiqueta, totalCentavos, children }: { icono: ReactNode; etiqueta: string; totalCentavos: number; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-lienzo px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm text-tinta-tenue">
        {icono} {etiqueta}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-tinta">{pesosDesdeCentavos(totalCentavos)}</p>
      <dl className="mt-2 border-t border-borde pt-1">{children}</dl>
    </section>
  );
}

function Fila({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <dt className="text-tinta-suave">{etiqueta}</dt>
      <dd className={cn('tabular-nums text-tinta', tono)}>{valor}</dd>
    </div>
  );
}

/** Con la caja cerrada: lo que se contó y cuánto se apartó de lo esperado. */
function Declarado({ esperado, declarado }: { esperado: number; declarado: number }) {
  const diferencia = declarado - esperado;
  return (
    <>
      <Fila etiqueta="Declarado al cerrar" valor={pesosDesdeCentavos(declarado)} />
      <Fila etiqueta="Diferencia" valor={diferencia ? pesosDesdeCentavos(diferencia) : 'Sin diferencia'} tono={diferencia < 0 ? 'text-error' : diferencia > 0 ? 'text-alerta' : 'text-exito'} />
    </>
  );
}
