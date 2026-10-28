import { ArrowDownRight, ArrowUpRight, CircleDollarSign } from 'lucide-react';
import { leerPeriodo, type Periodo } from '@/lib/periodos';
import { CifraPeriodo, ESTE_PERIODO, NavegadorPeriodo } from '@/components/periodo';
import { EstadoVacio, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';

/**
 * EJEMPLO — una pantalla de balance por período, como Facturación del panel.
 *
 * No es un componente para copiar tal cual: es la forma armada. Lo que sí se
 * reusa son las piezas (`NavegadorPeriodo`, `CifraPeriodo`, `lib/periodos.ts`);
 * esto muestra cómo se combinan y por qué quedan así. Va en
 * `app/(panel)/<ruta>/page.tsx` y cambia sólo de dónde salen los movimientos.
 *
 * El período vive en la URL (`?tipo=mes&valor=2026-09`), así que la página se
 * renderiza entera en el servidor con el rango ya resuelto. Sin parámetros abre
 * en el mes corriente, y un enlace viejo o tocado a mano cae ahí en vez de dar
 * error (`leerPeriodo` no tira nunca).
 */

export const dynamic = 'force-dynamic';

const RUTA = '/facturacion';

interface Movimiento {
  id: string;
  tipo: 'entrada' | 'salida';
  /** El día del movimiento, `YYYY-MM-DD`. */
  fecha: string;
  concepto: string;
  /** Centavos enteros: la plata nunca es un float. */
  centavos: number;
  /** El importe original si se cargó en otra moneda, ya formateado. */
  original?: string | null;
}

/** Reemplazar por la consulta real, filtrando por `desde` y `hasta` inclusive. */
async function movimientosDelRango(_periodo: Pick<Periodo, 'desde' | 'hasta'>): Promise<Movimiento[]> {
  return [];
}

function formatearMonto(centavos: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(
    centavos / 100,
  );
}

function formatearDia(iso: string): string {
  // Al mediodía UTC: a medianoche, en Argentina el día 1 se leería como el 31.
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(
    new Date(`${iso}T12:00:00.000Z`),
  );
}

export default async function PaginaBalance({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; valor?: string }>;
}) {
  const { tipo, valor } = await searchParams;
  const periodo = leerPeriodo(tipo, valor);

  /*
   * Entradas y salidas en una sola lista, de la más nueva a la más vieja.
   * Mezcladas y no en dos tablas: lo que se quiere leer de un período es el
   * movimiento del dinero, y separarlo obliga a ir y volver entre dos listas
   * para reconstruir en qué orden pasaron las cosas.
   */
  const movimientos = (await movimientosDelRango(periodo)).sort((a, b) =>
    b.fecha.localeCompare(a.fecha),
  );

  // Las cifras salen de las MISMAS filas que la lista: un total que no cuadra
  // con lo que tiene debajo es peor que no mostrarlo.
  const sumar = (t: Movimiento['tipo']) =>
    movimientos.filter((m) => m.tipo === t).reduce((s, m) => s + m.centavos, 0);
  const entro = sumar('entrada');
  const salio = sumar('salida');
  const balance = entro - salio;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-tinta">Facturación</h1>
        <p className="mt-1 text-sm text-tinta-tenue">Lo que entra y lo que sale.</p>
      </header>

      <Tarjeta>
        {/* El navegador va en el lugar de la acción del título: arriba a la
            derecha, a la altura de «Balance». Es el control de toda la tarjeta,
            no de una parte. */}
        <TituloSeccion accion={<NavegadorPeriodo periodo={periodo} ruta={RUTA} />}>
          Balance
        </TituloSeccion>

        {/*
          Las tres cifras del período, grandes y primero: la pregunta al abrir
          la pantalla es cómo va ESTE período. Nada de una tabla de los últimos
          doce meses acá arriba; lo demás está a una flecha de distancia.

          El balance va primero y es el ÚNICO con color, acá y en la lista de
          abajo: es la respuesta, y las otras dos son de dónde salió. Pintando
          todo, la pantalla parece un semáforo — que entre plata no es «bueno»
          ni gastar es «malo». Lo que se quiere saber de un vistazo es si el
          período cerró arriba o abajo.
        */}
        <div className="grid gap-4 sm:grid-cols-3">
          <CifraPeriodo
            etiqueta="Balance"
            valor={formatearMonto(balance)}
            tono={balance < 0 ? 'text-error' : 'text-exito'}
          />
          <CifraPeriodo etiqueta="Entró" valor={formatearMonto(entro)} />
          {/*
            En negativo: es plata que se fue, y el signo lo dice sin pintarlo.
            El `|| 0` no es de adorno: sin él, un período sin salidas muestra
            «-US$ 0,00», porque en JavaScript el cero negativo existe y se imprime.
          */}
          <CifraPeriodo etiqueta="Gastos" valor={formatearMonto(-salio || 0)} />
        </div>

        {/* De dónde salen esas tres cifras. */}
        <div className="mt-6 border-t border-borde/60 pt-5">
          <h3 className="mb-4 text-sm font-medium text-tinta-suave">Movimientos</h3>

          {movimientos.length === 0 ? (
            <EstadoVacio
              titulo={`Ningún movimiento en ${ESTE_PERIODO[periodo.tipo]}`}
              detalle="Ni cobros acreditados ni gastos cargados."
              icono={<CircleDollarSign size={28} strokeWidth={1.25} />}
            />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Concepto</Th>
                  <Th className="text-right">Monto</Th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={`${m.tipo}-${m.id}`}>
                    <Td className="whitespace-nowrap text-tinta-suave">{formatearDia(m.fecha)}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        {/* La flecha dice para qué lado fue la plata; el color
                            queda para el balance. */}
                        {m.tipo === 'entrada' ? (
                          <ArrowUpRight size={14} strokeWidth={1.5} className="text-tinta-tenue" />
                        ) : (
                          <ArrowDownRight size={14} strokeWidth={1.5} className="text-tinta-tenue" />
                        )}
                        {m.concepto}
                        {m.original ? (
                          <span className="text-xs text-tinta-tenue">{m.original}</span>
                        ) : null}
                      </span>
                    </Td>
                    <Td className="text-right font-medium tabular-nums text-tinta">
                      {m.tipo === 'entrada' ? '+' : '−'}
                      {formatearMonto(m.centavos)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </div>
      </Tarjeta>
    </div>
  );
}
