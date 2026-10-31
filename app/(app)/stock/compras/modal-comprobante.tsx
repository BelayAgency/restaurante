'use client';

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CampoAdjunto, subirAdjunto, type ArchivoAdjunto } from '@/components/campo-adjunto';
import { Campo } from '@/components/campo';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { Selector } from '@/components/selector';
import { Switch } from '@/components/switch';
import { Tabs } from '@/components/tabs';
import { useToast } from '@/components/toast';
import { datosComprobante } from '@/dominio/compras';
import { diaLocal } from '@/dominio/reservas';
import { NOMBRE_UNIDAD } from '@/dominio/stock';
import { centavosDesdeTexto, numeroDesdeTexto, pesosDesdeCentavos } from '@/lib/formato';
import type { Stock } from '@/servidor/stock';
import { accionRegistrarComprobante } from './acciones';

type Linea = { clave: string; insumoId: string | null; presentacionId: string | null; cantidad: string; costo: string };

const lineaVacia = (): Linea => ({ clave: crypto.randomUUID(), insumoId: null, presentacionId: null, cantidad: '', costo: '' });

/**
 * Cargar un comprobante del proveedor como dice el papel: total, número, fecha
 * y la foto. Detallar los insumos es optativo; si se detallan, la mercadería
 * entra al depósito y se actualiza su costo.
 */
export function ModalComprobante({ stock, proveedorInicial = null, alCerrar }: { stock: Stock; proveedorInicial?: string | null; alCerrar: () => void }) {
  const toast = useToast();
  const [tipo, setTipo] = useState<'factura' | 'nota_credito'>('factura');
  const [proveedorId, setProveedorId] = useState<string | null>(proveedorInicial);
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(() => diaLocal());
  const [total, setTotal] = useState('');
  const [observacion, setObservacion] = useState('');
  const [adjunto, setAdjunto] = useState<ArchivoAdjunto | null>(null);
  const [conInsumos, setConInsumos] = useState(false);
  const [depositoId, setDepositoId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  const cambiar = (clave: string, cambios: Partial<Linea>) => setLineas(lineas.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const sumaLineas = lineas.reduce((s, l) => s + (centavosDesdeTexto(l.costo || '0') ?? 0), 0);
  const totalCentavos = centavosDesdeTexto(total || '0') ?? 0;
  const detalla = conInsumos && tipo === 'factura';

  function guardar() {
    const datos = datosComprobante.safeParse({
      proveedorId,
      tipo,
      numeroFactura: numero,
      fecha,
      totalCentavos,
      observacion: observacion.trim() || null,
      depositoId: detalla ? depositoId : null,
      lineas: detalla
        ? lineas.map((l) => ({
            insumoId: l.insumoId,
            presentacionId: l.presentacionId,
            cantidadPresentaciones: numeroDesdeTexto(l.cantidad || '0') ?? 0,
            costoCentavos: centavosDesdeTexto(l.costo || '0') ?? 0,
          }))
        : [],
    });
    if (!datos.success) return setError(datos.error.issues[0]?.message);
    iniciar(async () => {
      const resultado = await accionRegistrarComprobante(datos.data);
      if (!resultado.ok) return setError(resultado.error);
      const fallo = adjunto ? await subirAdjunto('compra', resultado.datos, adjunto) : null;
      if (fallo) toast.alerta(tipo === 'factura' ? 'Factura cargada sin la foto' : 'Nota de crédito cargada sin la foto', `${fallo}. Subila desde la ficha.`);
      else toast.exito(tipo === 'factura' ? 'Factura cargada' : 'Nota de crédito cargada');
      alCerrar();
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo={tipo === 'factura' ? 'Cargar factura' : 'Cargar nota de crédito'} ancho={detalla}>
      <div className="modal-cuerpo flex flex-col gap-4">
        <Tabs
          etiqueta="Tipo de comprobante"
          valor={tipo}
          alCambiar={(v) => setTipo(v as 'factura' | 'nota_credito')}
          opciones={[
            { valor: 'factura', etiqueta: 'Factura' },
            { valor: 'nota_credito', etiqueta: 'Nota de crédito' },
          ]}
          parejas
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="etiqueta-campo">Proveedor</label>
            <Selector opciones={stock.proveedores.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} valor={proveedorId} alElegir={setProveedorId} buscador vacio="Cargá el proveedor desde Stock" />
          </div>
          <Campo etiqueta="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          <Campo etiqueta="Número" value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={40} placeholder="0000-00000000" required />
          <div className="sm:col-span-2">
            <CampoNumero etiqueta="Importe total" valor={total} alCambiar={setTotal} decimales={2} prefijo="$" placeholder="0" />
          </div>
        </div>
        <Campo etiqueta="Observación (opcional)" value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={300} />
        <CampoAdjunto etiqueta="Foto o PDF del comprobante" alCambiar={setAdjunto} />

        {tipo === 'factura' ? (
          <div className="rounded-xl bg-lienzo p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-tinta">Detallar insumos</p>
                <p className="text-xs text-tinta-tenue">La mercadería entra al stock y se actualiza su costo.</p>
              </div>
              <Switch activo={conInsumos} alCambiar={setConInsumos} etiqueta="Detallar insumos" />
            </div>
            {detalla ? (
              <div className="mt-4 flex flex-col gap-3">
                <div className="w-full sm:w-64">
                  <label className="etiqueta-campo">Entra a</label>
                  <Selector opciones={stock.depositos.map((d) => ({ valor: d.id, etiqueta: d.nombre }))} valor={depositoId} alElegir={setDepositoId} />
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[36rem]">
                    <div className="mb-1 grid grid-cols-[1fr_1fr_5rem_7rem_2rem] gap-2 text-xs text-tinta-tenue">
                      <span>Insumo</span>
                      <span>Presentación</span>
                      <span className="text-right">Cantidad</span>
                      <span className="text-right">Costo</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {lineas.map((l) => {
                        const insumo = stock.insumos.find((i) => i.id === l.insumoId);
                        return (
                          <div key={l.clave} className="grid grid-cols-[1fr_1fr_5rem_7rem_2rem] items-center gap-2">
                            <Selector
                              opciones={stock.insumos.filter((i) => i.tipo === 'compra').map((i) => ({ valor: i.id, etiqueta: i.nombre }))}
                              valor={l.insumoId}
                              alElegir={(insumoId) => cambiar(l.clave, { insumoId, presentacionId: null })}
                              buscador
                            />
                            <Selector
                              opciones={[
                                { valor: 'suelto', etiqueta: insumo ? `Suelto (${NOMBRE_UNIDAD[insumo.unidad]})` : 'Suelto' },
                                ...(insumo?.presentaciones.map((p) => ({ valor: p.id, etiqueta: p.nombre })) ?? []),
                              ]}
                              valor={l.presentacionId ?? 'suelto'}
                              alElegir={(v) => cambiar(l.clave, { presentacionId: v === 'suelto' ? null : v })}
                              deshabilitado={!insumo}
                            />
                            <NumeroInline etiqueta="Cantidad" valor={l.cantidad} alCambiar={(cantidad) => cambiar(l.clave, { cantidad })} decimales={3} />
                            <NumeroInline etiqueta="Costo" valor={l.costo} alCambiar={(costo) => cambiar(l.clave, { costo })} decimales={2} />
                            <Boton variante="fantasma" tamano="sm" soloIcono aria-label="Quitar línea" onClick={() => setLineas(lineas.filter((x) => x.clave !== l.clave))} disabled={lineas.length === 1}>
                              <X size={14} strokeWidth={1.5} />
                            </Boton>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Boton variante="fantasma" tamano="sm" onClick={() => setLineas([...lineas, lineaVacia()])}>
                    <Plus size={14} strokeWidth={1.5} /> Línea
                  </Boton>
                  <p className={sumaLineas !== totalCentavos && totalCentavos > 0 ? 'text-sm tabular-nums text-alerta' : 'text-sm tabular-nums text-tinta-suave'}>
                    Suma de los insumos: {pesosDesdeCentavos(sumaLineas)}
                    {sumaLineas !== totalCentavos && totalCentavos > 0 ? ' · no coincide con el total' : ''}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
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
