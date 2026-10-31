'use client';

import { startTransition, useOptimistic, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileText, Paperclip, Plus, Wallet } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Tabs } from '@/components/tabs';
import { EstadoVacio, Metrica, Tabla, Tarjeta, Td, Th } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fechaCorta, pesosDesdeCentavos } from '@/lib/formato';
import type { CuentasDeProveedores, ListadoFacturas } from '@/servidor/compras';
import type { Stock } from '@/servidor/stock';
import { InsigniaEstado } from './estado-comprobante';
import { FichaFactura } from './ficha-factura';
import { ModalComprobante } from './modal-comprobante';
import { ModalCuenta } from './modal-cuenta';
import { ModalPago } from './modal-pago';

interface Props {
  vista: 'facturas' | 'proveedores';
  resumen: { gastoCentavos: number; pagadoCentavos: number; deudaCentavos: number; enReclamoCentavos: number; saldoAFavorCentavos: number };
  listado: ListadoFacturas | null;
  cuentas: CuentasDeProveedores | null;
  stock: Stock;
  filtrando: boolean;
  buscador: ReactNode;
  filtro: ReactNode;
  paginacion: ReactNode;
}

/**
 * Las facturas de los proveedores y lo que se les debe. Las cifras de arriba
 * son del período elegido, salvo la deuda, que es la de hoy sumando todos los
 * meses: lo que se debe no se reinicia cuando cambia el mes.
 */
export function PantallaCompras({ vista, resumen, listado, cuentas, stock, filtrando, buscador, filtro, paginacion }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [vistaVisible, setVistaVisible] = useOptimistic(vista);
  const [cargando, setCargando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const proveedores = stock.proveedores.map((p) => ({ id: p.id, nombre: p.nombre }));

  function cambiarVista(valor: string) {
    // El período se conserva; los filtros de la lista de facturas no aplican a la otra vista.
    const consulta = new URLSearchParams();
    for (const clave of ['tipo', 'valor']) if (parametros.get(clave)) consulta.set(clave, parametros.get(clave)!);
    if (valor === 'facturas') consulta.set('vista', 'facturas');
    startTransition(() => {
      setVistaVisible(valor as Props['vista']);
      router.replace(`${ruta}?${consulta}`, { scroll: false });
    });
  }

  return (
    <div>
      <div className="mb-6 grid gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta="Facturado en el período" valor={pesosDesdeCentavos(resumen.gastoCentavos)} />
        <Metrica etiqueta="Pagado en el período" valor={pesosDesdeCentavos(resumen.pagadoCentavos)} />
        <Metrica
          etiqueta="Deuda total"
          valor={pesosDesdeCentavos(resumen.deudaCentavos)}
          detalle={resumen.enReclamoCentavos > 0 ? `${pesosDesdeCentavos(resumen.enReclamoCentavos)} en reclamo` : 'Todos los meses'}
          tono={resumen.deudaCentavos > 0 ? 'error' : undefined}
        />
        <Metrica etiqueta="A favor" valor={pesosDesdeCentavos(resumen.saldoAFavorCentavos)} detalle="Pagado de más a proveedores" />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          etiqueta="Vista de compras"
          valor={vistaVisible}
          alCambiar={cambiarVista}
          opciones={[
            { valor: 'proveedores', etiqueta: 'Proveedores' },
            { valor: 'facturas', etiqueta: 'Facturas' },
          ]}
          parejas
        />
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={() => setPagando(true)}>
            <Wallet size={15} strokeWidth={1.5} /> Registrar pago
          </Boton>
          <Boton variante="primario" onClick={() => setCargando(true)}>
            <Plus size={15} strokeWidth={1.75} /> Cargar factura
          </Boton>
        </div>
      </div>

      {vistaVisible === 'facturas' && listado ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {buscador}
            {filtro}
          </div>
          <Tarjeta padding={false}>
            {listado.filas.length === 0 ? (
              <div className="p-5 sm:p-6">
                <EstadoVacio icono={<FileText size={28} strokeWidth={1.5} />} titulo={filtrando ? 'Ningún comprobante coincide' : 'No hay comprobantes en este período'} />
              </div>
            ) : (
              <div className="overflow-x-auto px-4 py-1 sm:px-5">
                <Tabla>
                  <thead>
                    <tr>
                      <Th className="max-sm:hidden">Fecha</Th>
                      <Th>Proveedor</Th>
                      <Th className="max-sm:hidden">Comprobante</Th>
                      <Th className="text-right">Total</Th>
                      <Th className="text-right max-sm:hidden">Saldo</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {listado.filas.map((f) => (
                      <tr key={f.id} onClick={() => setFichaId(f.id)} className={cn('cursor-pointer hover:bg-lienzo', f.estado === 'anulada' && 'opacity-60')}>
                        <Td className="tabular-nums max-sm:hidden">{fechaCorta(f.fecha)}</Td>
                        <Td className="font-medium">
                          {f.proveedor}
                          {/* En el teléfono la fecha y el número van debajo del proveedor, en vez de en sus columnas. */}
                          <span className="block text-xs font-normal tabular-nums text-tinta-tenue sm:hidden">
                            {fechaCorta(f.fecha)} · {f.tipo === 'nota_credito' ? 'NC ' : ''}
                            {f.numeroFactura}
                          </span>
                        </Td>
                        <Td className="max-sm:hidden">
                          <button type="button" onClick={() => setFichaId(f.id)} className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-tinta hover:text-acento">
                            {f.tipo === 'nota_credito' ? 'NC ' : ''}
                            {f.numeroFactura}
                            {f.tieneAdjunto ? <Paperclip size={13} strokeWidth={1.5} className="text-tinta-tenue" aria-label="Tiene foto" /> : null}
                          </button>
                        </Td>
                        <Td className={cn('text-right tabular-nums', f.estado === 'anulada' && 'line-through')}>
                          {f.tipo === 'nota_credito' ? '−' : ''}
                          {pesosDesdeCentavos(f.totalCentavos)}
                        </Td>
                        <Td className="text-right tabular-nums max-sm:hidden">{f.tipo === 'factura' && f.estado !== 'anulada' && f.saldoCentavos > 0 ? pesosDesdeCentavos(f.saldoCentavos) : '—'}</Td>
                        <Td>
                          <InsigniaEstado estado={f.estado} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              </div>
            )}
          </Tarjeta>
          <div className="mt-4 empty:hidden">{paginacion}</div>
        </>
      ) : null}

      {vistaVisible === 'proveedores' && cuentas ? (
        <>
          <div className="mb-3">{buscador}</div>
          <Tarjeta padding={false}>
            {cuentas.filas.length === 0 ? (
              <div className="p-5 sm:p-6">
                <EstadoVacio titulo={filtrando ? 'Ningún proveedor coincide' : 'Todavía no hay facturas cargadas'} />
              </div>
            ) : (
              <div className="overflow-x-auto px-4 py-1 sm:px-5">
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Proveedor</Th>
                      <Th className="text-right max-sm:hidden">Facturado</Th>
                      <Th className="text-right max-sm:hidden">Pagado</Th>
                      <Th className="text-right">Deuda</Th>
                      <Th className="text-right max-sm:hidden">Impagas</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.filas.map((c) => (
                      <tr key={c.id} onClick={() => setCuentaId(c.id)} className="cursor-pointer hover:bg-lienzo">
                        <Td>
                          <button type="button" onClick={() => setCuentaId(c.id)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-tinta hover:text-acento">
                            {c.nombre}
                          </button>
                          {c.enReclamo ? <span className="ml-2 text-xs text-error">{c.enReclamo} en reclamo</span> : null}
                          {c.impagas ? <span className="block text-xs text-tinta-tenue sm:hidden">{c.impagas} {c.impagas === 1 ? 'impaga' : 'impagas'}</span> : null}
                        </Td>
                        <Td className="text-right tabular-nums text-tinta-suave max-sm:hidden">{pesosDesdeCentavos(c.facturadoCentavos)}</Td>
                        <Td className="text-right tabular-nums text-tinta-suave max-sm:hidden">{pesosDesdeCentavos(c.pagadoCentavos)}</Td>
                        <Td className={cn('text-right font-medium tabular-nums', c.deudaCentavos > 0 ? 'text-error' : 'text-tinta')}>
                          {c.deudaCentavos > 0 ? pesosDesdeCentavos(c.deudaCentavos) : c.saldoAFavorCentavos > 0 ? `${pesosDesdeCentavos(c.saldoAFavorCentavos)} a favor` : '—'}
                        </Td>
                        <Td className="text-right tabular-nums max-sm:hidden">{c.impagas || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              </div>
            )}
          </Tarjeta>
          <div className="mt-4 empty:hidden">{paginacion}</div>
        </>
      ) : null}

      {cargando ? <ModalComprobante stock={stock} alCerrar={() => setCargando(false)} /> : null}
      {pagando ? <ModalPago proveedores={proveedores} proveedorInicial={null} alCerrar={() => setPagando(false)} /> : null}
      {fichaId ? <FichaFactura id={fichaId} proveedores={proveedores} alCerrar={() => setFichaId(null)} /> : null}
      {cuentaId ? <ModalCuenta proveedorId={cuentaId} proveedores={proveedores} stock={stock} alCerrar={() => setCuentaId(null)} /> : null}
    </div>
  );
}
