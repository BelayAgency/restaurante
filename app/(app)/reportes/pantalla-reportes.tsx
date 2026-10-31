'use client';

import { useState, type ReactNode } from 'react';
import { GraficoActividad } from '@/components/grafico-actividad';
import { PanelTab, Tabs } from '@/components/tabs';
import { EstadoVacio, Insignia, Metrica, Tabla, Tarjeta, Td, Th } from '@/components/ui';
import { formatearCantidad, type UnidadBase } from '@/dominio/stock';
import { diaLocal } from '@/dominio/reservas';
import { fechaCorta, hora, pesosDesdeCentavos } from '@/lib/formato';
import type { CajaDelPeriodo, ReporteVentas } from '@/servidor/reportes';

interface Props {
  ventas: ReporteVentas;
  compras: { proveedor: string; totalCentavos: number; facturas: number }[];
  stock: { nombre: string; unidad: UnidadBase; cantidad: number; valorCentavos: number }[];
  cajas: CajaDelPeriodo[];
}

/** `31/10 20:05 – 01:40`: la fecha del cierre sólo si no es la de la apertura. */
function horarioCaja(c: CajaDelPeriodo): string {
  const abre = diaLocal(new Date(c.abiertoEn));
  const desde = `${fechaCorta(abre).slice(0, 5)} ${hora(c.abiertoEn)}`;
  if (!c.cerradoEn) return `${desde} · abierta`;
  const cierra = diaLocal(new Date(c.cerradoEn));
  return `${desde} – ${cierra === abre ? '' : `${fechaCorta(cierra).slice(0, 5)} `}${hora(c.cerradoEn)}`;
}

function TablaSimple({ cabeza, filas, vacio }: { cabeza: { texto: string; derecha?: boolean }[]; filas: ReactNode[][]; vacio: string }) {
  if (!filas.length) return <EstadoVacio titulo={vacio} />;
  return (
    <div className="overflow-x-auto">
      <Tabla>
        <thead>
          <tr>
            {cabeza.map((c) => (
              <Th key={c.texto} className={c.derecha ? 'text-right' : undefined}>
                {c.texto}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((celda, j) => (
                <Td key={j} className={cabeza[j]?.derecha ? 'text-right tabular-nums' : undefined}>
                  {celda}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Tabla>
    </div>
  );
}

export function PantallaReportes({ ventas, compras, stock, cajas }: Props) {
  const [tab, setTab] = useState('ventas');
  const p = pesosDesdeCentavos;
  const { resumen } = ventas;
  const mejores = ventas.rentabilidad.slice(0, 5);
  const peores = [...ventas.rentabilidad].reverse().slice(0, 5);

  return (
    <>
      <div className="mb-4 grid gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta="Ventas" valor={p(resumen.ventasCentavos)} detalle={`Propinas aparte: ${p(resumen.propinasCentavos)}`} />
        <Metrica etiqueta="Cuentas" valor={String(resumen.cuentas)} detalle={`${resumen.comensales} comensales`} />
        <Metrica etiqueta="Ticket promedio" valor={p(resumen.ticketPromedioCentavos)} />
        <Metrica etiqueta="Por comensal" valor={p(resumen.porComensalCentavos)} />
      </div>

      <Tarjeta>
        <div className="overflow-x-auto">
          <Tabs
            etiqueta="Reportes"
            valor={tab}
            alCambiar={setTab}
            opciones={[
              { valor: 'ventas', etiqueta: 'Ventas' },
              { valor: 'platos', etiqueta: 'Platos' },
              { valor: 'rentabilidad', etiqueta: 'Rentabilidad' },
              { valor: 'mozos', etiqueta: 'Mozos' },
              { valor: 'cajas', etiqueta: 'Cajas' },
              { valor: 'compras', etiqueta: 'Compras' },
              { valor: 'stock', etiqueta: 'Stock' },
            ]}
          />
        </div>

        <PanelTab valor="ventas" activo={tab}>
          <div className="mt-4 flex flex-col gap-6">
            <div>
              <p className="mb-2 text-sm font-medium text-tinta">Por hora</p>
              <GraficoActividad datos={ventas.porHora.map((c) => c / 100)} descripcion="Ventas por hora del día" />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <TablaSimple
                cabeza={[{ texto: 'Día' }, { texto: 'Ventas', derecha: true }]}
                filas={ventas.porDia.map((d) => [fechaCorta(d.dia), p(d.ventasCentavos)])}
                vacio="No hubo ventas en el período"
              />
              <TablaSimple
                cabeza={[{ texto: 'Día de la semana' }, { texto: 'Ventas', derecha: true }]}
                filas={ventas.porSemana.map((d) => [d.dia, p(d.ventasCentavos)])}
                vacio="No hubo ventas en el período"
              />
            </div>
            <TablaSimple
              cabeza={[{ texto: 'Categoría' }, { texto: 'Unidades', derecha: true }, { texto: 'Ventas', derecha: true }]}
              filas={ventas.porCategoria.map((c) => [c.nombre, c.cantidad, p(c.ventasCentavos)])}
              vacio="No hubo ventas en el período"
            />
          </div>
        </PanelTab>

        <PanelTab valor="platos" activo={tab}>
          <div className="mt-4">
            <TablaSimple
              cabeza={[{ texto: 'Plato' }, { texto: 'Categoría' }, { texto: 'Unidades', derecha: true }, { texto: 'Ventas', derecha: true }]}
              filas={ventas.platos.map((x) => [x.nombre, x.categoria, x.cantidad, p(x.ventasCentavos)])}
              vacio="No se vendió nada en el período"
            />
          </div>
        </PanelTab>

        <PanelTab valor="rentabilidad" activo={tab}>
          <div className="mt-4 flex flex-col gap-6">
            {ventas.rentabilidad.length === 0 ? (
              <EstadoVacio titulo="Ningún plato vendido tiene receta" detalle="La rentabilidad sale del costo teórico de la receta." />
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                {[
                  { titulo: 'Los que más dejan', lista: mejores },
                  { titulo: 'Los que menos dejan', lista: peores },
                ].map((bloque) => (
                  <div key={bloque.titulo}>
                    <p className="mb-2 text-sm font-medium text-tinta">{bloque.titulo}</p>
                    <TablaSimple
                      cabeza={[{ texto: 'Plato' }, { texto: 'Ventas', derecha: true }, { texto: 'Costo', derecha: true }, { texto: 'Margen', derecha: true }]}
                      filas={bloque.lista.map((x) => [
                        x.nombre,
                        p(x.ventasCentavos),
                        p(x.costoCentavos ?? 0),
                        <Insignia key="m" tono={(x.margenCentavos ?? 0) > 0 ? 'exito' : 'error'}>
                          {p(x.margenCentavos ?? 0)}
                        </Insignia>,
                      ])}
                      vacio="—"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </PanelTab>

        <PanelTab valor="mozos" activo={tab}>
          <div className="mt-4">
            <TablaSimple
              cabeza={[{ texto: 'Mozo' }, { texto: 'Cuentas', derecha: true }, { texto: 'Comensales', derecha: true }, { texto: 'Ventas', derecha: true }, { texto: 'Por comensal', derecha: true }]}
              filas={ventas.porMozo.map((m) => [m.nombre, m.cuentas, m.comensales, p(m.ventasCentavos), p(m.porComensalCentavos)])}
              vacio="No hubo cuentas cerradas en el período"
            />
          </div>
        </PanelTab>

        <PanelTab valor="cajas" activo={tab}>
          <div className="mt-4">
            <TablaSimple
              cabeza={[
                { texto: 'Caja' },
                { texto: 'Horario' },
                { texto: 'Cobros', derecha: true },
                { texto: 'Ventas', derecha: true },
                { texto: 'Propinas', derecha: true },
                { texto: 'Retiros y gastos', derecha: true },
                { texto: 'Diferencia', derecha: true },
              ]}
              filas={cajas.map((c) => [
                c.abiertoPor,
                horarioCaja(c),
                c.cobros,
                p(c.ventasCentavos),
                p(c.propinasCentavos),
                c.salidasCentavos ? `− ${p(c.salidasCentavos)}` : '—',
                c.diferenciaCentavos === null ? '—' : c.diferenciaCentavos === 0 ? (
                  <Insignia key="d" tono="exito">Sin diferencia</Insignia>
                ) : (
                  <Insignia key="d" tono={c.diferenciaCentavos < 0 ? 'error' : 'alerta'}>
                    {c.diferenciaCentavos > 0 ? '+ ' : '− '}
                    {p(Math.abs(c.diferenciaCentavos))}
                  </Insignia>
                ),
              ])}
              vacio="No se abrió ninguna caja en el período"
            />
          </div>
        </PanelTab>

        <PanelTab valor="compras" activo={tab}>
          <div className="mt-4">
            <TablaSimple
              cabeza={[{ texto: 'Proveedor' }, { texto: 'Facturas', derecha: true }, { texto: 'Total', derecha: true }]}
              filas={compras.map((c) => [c.proveedor, c.facturas, p(c.totalCentavos)])}
              vacio="No hubo compras en el período"
            />
          </div>
        </PanelTab>

        <PanelTab valor="stock" activo={tab}>
          <div className="mt-4">
            <p className="mb-2 text-sm text-tinta-tenue">Hoy, a costo promedio: {p(stock.reduce((s, x) => s + x.valorCentavos, 0))}</p>
            <TablaSimple
              cabeza={[{ texto: 'Insumo' }, { texto: 'Cantidad', derecha: true }, { texto: 'Valor', derecha: true }]}
              filas={stock.map((x) => [x.nombre, formatearCantidad(x.cantidad, x.unidad), p(x.valorCentavos)])}
              vacio="No hay insumos"
            />
          </div>
        </PanelTab>
      </Tarjeta>
    </>
  );
}
