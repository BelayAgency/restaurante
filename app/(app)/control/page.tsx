import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CifraPeriodo, NavegadorPeriodo } from '@/components/periodo';
import { EstadoVacio, Insignia, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { fechaHora, pesosDesdeCentavos } from '@/lib/formato';
import { leerPeriodo } from '@/lib/periodos';
import { usuarioDePagina } from '@/lib/sesion';
import { tableroDeControl, type TipoHecho } from '@/servidor/control';

export const metadata: Metadata = { title: 'Control' };

const RUTA = '/control';

const NOMBRE_HECHO: Record<TipoHecho, string> = {
  anulacion: 'Anulación',
  descuento: 'Descuento',
  cortesia: 'Cortesía',
  precio: 'Precio cambiado',
  sin_cobrar: 'Cerrada sin cobrar',
};

function Ranking({ titulo, filas, nombres, monto }: { titulo: string; filas: { id: string; cantidad: number; montoCentavos: number }[]; nombres: Record<string, string>; monto: string }) {
  return (
    <Tarjeta>
      <p className="mb-2 text-sm font-medium text-tinta">{titulo}</p>
      {filas.length === 0 ? (
        <p className="py-4 text-sm text-tinta-tenue">Sin movimientos.</p>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Persona</Th>
              <Th className="text-right">Veces</Th>
              <Th className="text-right">{monto}</Th>
            </tr>
          </thead>
          <tbody>
            {filas.slice(0, 8).map((f) => (
              <tr key={f.id}>
                <Td>{nombres[f.id] ?? '—'}</Td>
                <Td className="text-right tabular-nums">{f.cantidad}</Td>
                <Td className="text-right tabular-nums">{pesosDesdeCentavos(f.montoCentavos)}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  );
}

/**
 * El tablero del dueño: cada rubro por donde se puede ir la plata, en pesos y
 * en cantidad, quién lo hizo y quién lo autorizó. El patrón, no el caso
 * suelto, es lo que delata: por eso los rankings.
 */
export default async function PaginaControl({ searchParams }: PageProps<'/control'>) {
  const usuario = await usuarioDePagina();
  if (!puede(usuario, 'control.ver')) redirect('/');
  const { tipo, valor } = await searchParams;
  const periodo = leerPeriodo(typeof tipo === 'string' ? tipo : undefined, typeof valor === 'string' ? valor : undefined);
  const tablero = await tableroDeControl(usuario, periodo.desde, periodo.hasta);
  const total = tablero.rubros.reduce((s, r) => s + r.montoCentavos, 0);
  const n = tablero.nombres;

  return (
    <>
      <TituloSeccion accion={<NavegadorPeriodo periodo={periodo} ruta={RUTA} />}>Dónde se va la plata</TituloSeccion>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <CifraPeriodo etiqueta="En total" valor={pesosDesdeCentavos(total)} tono={total > 0 ? 'text-error' : 'text-tinta'} />
        <CifraPeriodo etiqueta="Correcciones en cuentas" valor={String(tablero.hechos.length)} />
        <CifraPeriodo etiqueta="Faltante de stock" valor={pesosDesdeCentavos(tablero.rubros[0]!.montoCentavos)} />
      </div>

      <Tarjeta className="mb-6">
        <Tabla>
          <thead>
            <tr>
              <Th>Rubro</Th>
              <Th className="text-right">Cantidad</Th>
              <Th className="text-right">Plata</Th>
            </tr>
          </thead>
          <tbody>
            {tablero.rubros.map((r) => (
              <tr key={r.clave}>
                <Td>{r.titulo}</Td>
                <Td className="text-right tabular-nums">{r.cantidad}</Td>
                <Td className="text-right tabular-nums">{pesosDesdeCentavos(r.montoCentavos)}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>

      <section className="mb-6">
        <TituloSeccion>Por persona</TituloSeccion>
        <div className="grid gap-3 lg:grid-cols-2">
          <Ranking titulo="Quién hizo las correcciones" filas={tablero.rankings.porOperador} nombres={n} monto="Plata" />
          <Ranking titulo="Quién las autorizó" filas={tablero.rankings.porAutorizante} nombres={n} monto="Plata" />
          <Ranking titulo="En las mesas de cada mozo" filas={tablero.rankings.porMozo} nombres={n} monto="Plata" />
          <Ranking titulo="Diferencias de caja por cajero" filas={tablero.rankings.cajaPorCajero} nombres={n} monto="Diferencia" />
        </div>
      </section>

      <section className="mb-6">
        <TituloSeccion descripcion="Un mozo que vende mucho menos por persona que el resto merece una mirada.">Consumo por comensal</TituloSeccion>
        <Tarjeta>
          {tablero.rankings.consumoPorComensal.length === 0 ? (
            <EstadoVacio titulo="No hay cuentas cerradas en el período" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Mozo</Th>
                  <Th className="text-right">Cuentas</Th>
                  <Th className="text-right">Comensales</Th>
                  <Th className="text-right">Por comensal</Th>
                </tr>
              </thead>
              <tbody>
                {tablero.rankings.consumoPorComensal.map((f) => (
                  <tr key={f.id}>
                    <Td>{n[f.id] ?? '—'}</Td>
                    <Td className="text-right tabular-nums">{f.cuentas}</Td>
                    <Td className="text-right tabular-nums">{f.comensales}</Td>
                    <Td className="text-right tabular-nums">{pesosDesdeCentavos(f.porComensalCentavos)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
      </section>

      <section>
        <TituloSeccion>Detalle</TituloSeccion>
        <Tarjeta>
          {tablero.hechos.length === 0 ? (
            <EstadoVacio titulo="No hubo anulaciones, descuentos ni cortesías en el período" />
          ) : (
            <div className="overflow-x-auto">
              <Tabla>
                <thead>
                  <tr>
                    <Th>Cuándo</Th>
                    <Th>Qué</Th>
                    <Th>Hizo</Th>
                    <Th>Autorizó</Th>
                    <Th>Motivo</Th>
                    <Th className="text-right">Plata</Th>
                  </tr>
                </thead>
                <tbody>
                  {tablero.hechos.map((h) => (
                    <tr key={h.id}>
                      <Td className="tabular-nums">{fechaHora(h.momento)}</Td>
                      <Td>
                        {NOMBRE_HECHO[h.tipo]}
                        <div className="text-xs text-tinta-tenue">{h.detalle}</div>
                        <div className="flex gap-1">
                          {h.trasPrecuenta ? <Insignia tono="alerta">Tras precuenta</Insignia> : null}
                          {h.fueraDeHorario ? <Insignia tono="error">Fuera de horario</Insignia> : null}
                        </div>
                      </Td>
                      <Td>{n[h.operadorId] ?? '—'}</Td>
                      <Td>{h.autorizadoPorId ? (n[h.autorizadoPorId] ?? '—') : '—'}</Td>
                      <Td className="text-tinta-suave">
                        {(h.motivoId ? tablero.motivos[h.motivoId] : null) ?? '—'}
                        {h.motivoTexto ? <div className="text-xs">{h.motivoTexto}</div> : null}
                      </Td>
                      <Td className="text-right tabular-nums">{pesosDesdeCentavos(h.montoCentavos)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </div>
          )}
        </Tarjeta>
      </section>
    </>
  );
}
