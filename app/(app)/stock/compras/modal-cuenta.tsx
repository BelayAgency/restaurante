'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Ban, ExternalLink, Paperclip, Pencil, Plus, Wallet } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { CargandoFilas } from '@/components/carga';
import { MenuAcciones } from '@/components/menu-acciones';
import { Modal } from '@/components/modal';
import { PaginacionLocal, usePaginaLocal } from '@/components/paginacion-local';
import { CifraPeriodo } from '@/components/periodo';
import { Tabs } from '@/components/tabs';
import { useToast } from '@/components/toast';
import { Aviso, EstadoVacio, Tabla, Td, Th } from '@/components/ui';
import { NOMBRE_FORMA_PAGO } from '@/dominio/compras';
import { puede } from '@/dominio/permisos';
import { diaLocal } from '@/dominio/reservas';
import { cn } from '@/lib/cn';
import { fechaCorta, pesosDesdeCentavos } from '@/lib/formato';
import type { ResumenDeCuenta } from '@/servidor/compras';
import type { Stock } from '@/servidor/stock';
import { useSesion } from '../../sesion-cliente';
import { accionGuardarProveedor } from '../acciones';
import { accionAnularPago, accionResumenDeCuenta } from './acciones';
import { InsigniaEstado } from './estado-comprobante';
import { FichaFactura } from './ficha-factura';
import { ModalAnular } from './modal-anular';
import { ModalComprobante } from './modal-comprobante';
import { ModalPago } from './modal-pago';

const POR_PAGINA = 10;

type Vista = 'cuenta' | 'pagos';

function diasDesde(fecha: string): number {
  return Math.round((Date.parse(diaLocal()) - Date.parse(fecha)) / 86_400_000);
}

/**
 * Todo lo de un proveedor en un lugar: cuánto se le debe y desde cuándo, su
 * cuenta corriente (igual al resumen que manda él, para cruzarlos), sus
 * facturas y sus pagos. Cargarle una factura o pagarle se hace desde acá, sin
 * volver a elegirlo.
 */
export function ModalCuenta({ proveedorId, proveedores, stock, alCerrar }: { proveedorId: string; proveedores: { id: string; nombre: string }[]; stock: Stock; alCerrar: () => void }) {
  const [cuenta, setCuenta] = useState<ResumenDeCuenta | null>();
  const [, iniciar] = useTransition();

  const cargar = useCallback(() => {
    iniciar(async () => {
      const resultado = await accionResumenDeCuenta(proveedorId);
      setCuenta(resultado.ok ? resultado.datos : null);
    });
  }, [proveedorId]);

  useEffect(cargar, [cargar]);

  if (cuenta === undefined || cuenta === null) {
    return (
      <Modal abierto alCerrar={alCerrar} titulo="Cuenta del proveedor" ancho>
        <div className="modal-cuerpo">{cuenta === undefined ? <CargandoFilas filas={8} /> : <Aviso tono="error">No pudimos traer la cuenta, probá de nuevo.</Aviso>}</div>
      </Modal>
    );
  }
  return <CuentaProveedor cuenta={cuenta} proveedores={proveedores} stock={stock} recargar={cargar} alCerrar={alCerrar} />;
}

function CuentaProveedor({ cuenta, proveedores, stock, recargar, alCerrar }: { cuenta: ResumenDeCuenta; proveedores: { id: string; nombre: string }[]; stock: Stock; recargar: () => void; alCerrar: () => void }) {
  const { usuario } = useSesion();
  const toast = useToast();
  const [vista, setVista] = useState<Vista>('cuenta');
  const [abierto, setAbierto] = useState<'pago' | 'factura' | 'editar' | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [anulandoPago, setAnulandoPago] = useState<string | null>(null);
  const anula = puede(usuario, 'compras.anular');

  // La cuenta corriente se lee de abajo hacia arriba en el papel; acá lo último va primero.
  // Lo anulado también va en la cuenta, tachado y sin saldo: está a la vista, pero no la movió.
  const anulados = [
    ...cuenta.facturas
      .filter((f) => f.estado === 'anulada')
      .map((f) => ({
        id: f.id,
        clase: f.tipo,
        fecha: f.fecha,
        importeCentavos: f.tipo === 'factura' ? f.totalCentavos : -f.totalCentavos,
        saldoCentavos: null,
        detalle: `${f.tipo === 'factura' ? 'Factura' : 'Nota de crédito'} ${f.numeroFactura}`,
        estado: 'anulada' as const,
        anulado: true,
      })),
    ...cuenta.pagos
      .filter((p) => p.anulado)
      .map((p) => ({ id: p.id, clase: 'pago' as const, fecha: p.fecha, importeCentavos: -p.importeCentavos, saldoCentavos: null, detalle: `Pago · ${NOMBRE_FORMA_PAGO[p.forma]}`, estado: null, anulado: true })),
  ];
  // La cuenta se lee de abajo hacia arriba en el papel; acá lo último va primero. El orden es estable: a igual fecha queda el de carga.
  const filas = [...[...cuenta.movimientos].reverse().map((m) => ({ ...m, anulado: false })), ...anulados].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const movimientos = usePaginaLocal(filas, POR_PAGINA);
  const pagos = usePaginaLocal(cuenta.pagos, POR_PAGINA);
  const factura = new Map(cuenta.facturas.map((f) => [f.id, f]));

  const cerrarY = (fn: () => void) => () => {
    fn();
    recargar();
  };

  const datos = [
    `${cuenta.cantidadFacturas} ${cuenta.cantidadFacturas === 1 ? 'factura' : 'facturas'}`,
    cuenta.impagas ? `${cuenta.impagas} impagas` : 'todas pagas',
    cuenta.impagaMasVieja ? `la impaga más vieja es del ${fechaCorta(cuenta.impagaMasVieja)} (hace ${diasDesde(cuenta.impagaMasVieja)} días)` : null,
    cuenta.ultimoPago ? `último pago el ${fechaCorta(cuenta.ultimoPago)}` : 'nunca se le pagó',
    cuenta.primeraCompra ? `compras desde el ${fechaCorta(cuenta.primeraCompra)}` : null,
  ].filter(Boolean);

  return (
    <>
      <Modal
        abierto
        alCerrar={alCerrar}
        titulo={cuenta.proveedor.nombre}
        descripcion={cuenta.proveedor.cuit ? `CUIT ${cuenta.proveedor.cuit}` : 'Sin CUIT cargado'}
        acciones={<MenuAcciones acciones={[{ texto: 'Editar proveedor', icono: <Pencil size={15} strokeWidth={1.5} />, alElegir: () => setAbierto('editar') }]} />}
        ancho
      >
        <div className="modal-cuerpo flex flex-col gap-5">
          <div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <CifraPeriodo etiqueta="Se le debe" valor={pesosDesdeCentavos(cuenta.deudaCentavos)} tono={cuenta.deudaCentavos > 0 ? 'text-error' : 'text-tinta'} />
              <CifraPeriodo etiqueta="A favor" valor={pesosDesdeCentavos(cuenta.saldoAFavorCentavos)} />
              <CifraPeriodo etiqueta="Facturado" valor={pesosDesdeCentavos(cuenta.facturadoCentavos)} />
              <CifraPeriodo etiqueta="Pagado" valor={pesosDesdeCentavos(cuenta.pagadoCentavos)} />
            </div>
            <p className="mt-2 text-sm text-tinta-suave">{datos.join(' · ')}</p>
            {cuenta.enReclamoCentavos > 0 ? (
              <div className="mt-3">
                <Aviso tono="error">{pesosDesdeCentavos(cuenta.enReclamoCentavos)} en reclamo: los pagos no cancelan esas facturas hasta que se resuelvan.</Aviso>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              etiqueta="Qué ver del proveedor"
              valor={vista}
              alCambiar={(v) => setVista(v as Vista)}
              opciones={[
                { valor: 'cuenta', etiqueta: 'Cuenta corriente' },
                { valor: 'pagos', etiqueta: `Pagos (${cuenta.pagos.length})` },
              ]}
              parejas
            />
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" tamano="sm" onClick={() => setAbierto('factura')}>
                <Plus size={14} strokeWidth={1.75} /> Cargar factura
              </Boton>
              <Boton variante="primario" tamano="sm" onClick={() => setAbierto('pago')}>
                <Wallet size={14} strokeWidth={1.5} /> Registrar pago
              </Boton>
            </div>
          </div>

          {vista === 'cuenta' ? (
            cuenta.movimientos.length === 0 ? (
              <EstadoVacio titulo="Todavía no hay movimientos" />
            ) : (
              <div>
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Fecha</Th>
                      <Th>Detalle</Th>
                      <Th className="text-right">Pagado / Total</Th>
                      <Th className="text-right">Saldo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.visibles.map((m) => (
                      <tr key={m.id} onClick={m.clase === 'pago' ? undefined : () => setFichaId(m.id)} className={cn(m.clase !== 'pago' && 'cursor-pointer hover:bg-lienzo', m.anulado && 'opacity-60')}>
                        <Td className="tabular-nums">{fechaCorta(m.fecha)}</Td>
                        <Td>
                          <span className={cn('inline-flex items-center gap-1.5 text-tinta', m.anulado && 'line-through')}>
                            {m.detalle}
                            {factura.get(m.id)?.tieneAdjunto ? <Paperclip size={13} strokeWidth={1.5} className="text-tinta-tenue" aria-label="Tiene foto" /> : null}
                          </span>
                          {m.estado ? (
                            <span className="ml-2">
                              <InsigniaEstado estado={m.estado} />
                            </span>
                          ) : m.anulado ? (
                            <span className="ml-2">
                              <InsigniaEstado estado="anulada" />
                            </span>
                          ) : null}
                        </Td>
                        <Td className={cn('text-right tabular-nums', m.anulado && 'line-through')}>
                          {/* Una factura muestra cuánto de ella ya se cubrió; un pago o una nota de crédito, lo que bajó la deuda. */}
                          {m.anulado ? (
                            pesosDesdeCentavos(Math.abs(m.importeCentavos))
                          ) : m.clase === 'factura' ? (
                            <>
                              <span className={cn(factura.get(m.id)?.pagadoCentavos ? 'text-exito' : 'text-tinta-tenue')}>{pesosDesdeCentavos(factura.get(m.id)?.pagadoCentavos ?? 0)}</span>
                              <span className="text-tinta-tenue"> / </span>
                              {pesosDesdeCentavos(m.importeCentavos)}
                            </>
                          ) : (
                            <span className="text-exito">− {pesosDesdeCentavos(-m.importeCentavos)}</span>
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {m.saldoCentavos === null ? (
                            '—'
                          ) : (
                            <SaldoConFlecha saldoCentavos={m.saldoCentavos} cambioCentavos={m.importeCentavos} />
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
                <PaginacionLocal {...movimientos.controles} />
              </div>
            )
          ) : null}
          {vista === 'pagos' ? (
            cuenta.pagos.length === 0 ? (
              <EstadoVacio titulo="Todavía no se le pagó nada" />
            ) : (
              <div>
                <ul className="text-sm">
                  {pagos.visibles.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 border-b border-borde/60 py-2.5 last:border-0">
                      <div className={cn('min-w-0', p.anulado && 'opacity-60')}>
                        <p className={cn('text-tinta', p.anulado && 'line-through')}>
                          {fechaCorta(p.fecha)} · {NOMBRE_FORMA_PAGO[p.forma]} · <span className="tabular-nums">{pesosDesdeCentavos(p.importeCentavos)}</span>
                        </p>
                        <p className="text-xs text-tinta-tenue">
                          {p.anulado
                            ? `Anulado: ${p.motivoAnulacion ?? ''}`
                            : p.cubre.length
                              ? `Cubrió ${p.cubre.map((c) => `${c.numeroFactura} (${pesosDesdeCentavos(c.importeCentavos)})`).join(', ')}`
                              : 'Quedó a favor'}
                          {p.observacion ? ` · ${p.observacion}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {p.tieneAdjunto ? (
                          <a href={`/api/adjuntos/pago_proveedor/${p.id}`} target="_blank" rel="noopener noreferrer" className="fila-nav-accion pointer-events-auto opacity-100" aria-label="Ver comprobante">
                            <ExternalLink size={14} strokeWidth={1.5} />
                          </a>
                        ) : null}
                        {anula && !p.anulado ? (
                          <Boton variante="fantasma" tamano="sm" soloIcono aria-label="Anular pago" onClick={() => setAnulandoPago(p.id)}>
                            <Ban size={14} strokeWidth={1.5} />
                          </Boton>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                <PaginacionLocal {...pagos.controles} />
              </div>
            )
          ) : null}
        </div>
      </Modal>

      {abierto === 'pago' ? <ModalPago proveedores={proveedores} proveedorInicial={cuenta.proveedor.id} alCerrar={cerrarY(() => setAbierto(null))} /> : null}
      {abierto === 'factura' ? <ModalComprobante stock={stock} proveedorInicial={cuenta.proveedor.id} alCerrar={cerrarY(() => setAbierto(null))} /> : null}
      {abierto === 'editar' ? <ModalEditarProveedor proveedor={cuenta.proveedor} alCerrar={cerrarY(() => setAbierto(null))} /> : null}
      {fichaId ? <FichaFactura id={fichaId} proveedores={proveedores} alCerrar={cerrarY(() => setFichaId(null))} /> : null}
      {anulandoPago ? (
        <ModalAnular
          titulo="Anular pago"
          aviso="Las facturas que cubría vuelven a quedar impagas. Queda registrado quién lo anuló y por qué."
          alCerrar={() => setAnulandoPago(null)}
          alAnular={async (motivo) => {
            const resultado = await accionAnularPago(anulandoPago, motivo);
            if (!resultado.ok) return resultado.error;
            toast.exito('Pago anulado');
            setAnulandoPago(null);
            recargar();
            return null;
          }}
        />
      ) : null}
    </>
  );
}

/**
 * El saldo después de un movimiento: rojo si se le debe, gris en cero, verde
 * si queda a favor. La flecha dice qué hizo ese movimiento con la deuda —se
 * calcula con su importe y no contra la fila de arriba, así no depende de la
 * página—: sube en rojo, baja en verde. También con saldo a favor: ir de
 * −$100 a −$50 es deuda que sube.
 */
function SaldoConFlecha({ saldoCentavos, cambioCentavos }: { saldoCentavos: number; cambioCentavos: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {cambioCentavos > 0 ? (
        <ArrowUp size={13} strokeWidth={2} className="text-error" aria-label="Sube la deuda" />
      ) : cambioCentavos < 0 ? (
        <ArrowDown size={13} strokeWidth={2} className="text-exito" aria-label="Baja la deuda" />
      ) : null}
      <span className={saldoCentavos > 0 ? 'text-error' : saldoCentavos < 0 ? 'text-exito' : 'text-tinta-tenue'}>{pesosDesdeCentavos(saldoCentavos)}</span>
    </span>
  );
}

function ModalEditarProveedor({ proveedor, alCerrar }: { proveedor: ResumenDeCuenta['proveedor']; alCerrar: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState(proveedor.nombre);
  const [cuit, setCuit] = useState(proveedor.cuit ?? '');
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  function guardar() {
    iniciar(async () => {
      const resultado = await accionGuardarProveedor({ id: proveedor.id, nombre, cuit: cuit.trim() || null });
      if (!resultado.ok) return setError(resultado.error);
      toast.exito('Proveedor guardado');
      alCerrar();
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Editar proveedor">
      <div className="modal-cuerpo flex flex-col gap-4">
        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required data-foco-inicial />
        <Campo etiqueta="CUIT (opcional)" value={cuit} onChange={(e) => setCuit(e.target.value)} maxLength={20} inputMode="numeric" placeholder="00-00000000-0" />
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={guardar} cargando={guardando}>
          Guardar
        </Boton>
      </footer>
    </Modal>
  );
}
