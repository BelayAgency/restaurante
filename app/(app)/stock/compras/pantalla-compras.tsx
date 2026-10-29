'use client';

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { EstadoVacio, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import { NOMBRE_UNIDAD } from '@/dominio/stock';
import { centavosDesdeTexto, fechaCorta, numeroDesdeTexto, pesosDesdeCentavos } from '@/lib/formato';
import type { Stock } from '@/servidor/stock';
import { accionRegistrarCompra } from '../acciones';

interface FilaCompra {
  id: string;
  fecha: string;
  numeroFactura: string;
  totalCentavos: number;
  proveedor: string;
  deposito: string;
}

function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

function ModalCompra({ stock, alCerrar }: { stock: Stock; alCerrar: () => void }) {
  const toast = useToast();
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [depositoId, setDepositoId] = useState<string | null>(null);
  const [factura, setFactura] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [lineas, setLineas] = useState([{ clave: crypto.randomUUID(), insumoId: null as string | null, presentacionId: null as string | null, cantidad: '', costo: '' }]);
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  const cambiar = (clave: string, cambios: Partial<(typeof lineas)[number]>) => setLineas(lineas.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const total = lineas.reduce((s, l) => s + (centavosDesdeTexto(l.costo || '0') ?? 0), 0);

  function guardar() {
    iniciar(async () => {
      const resultado = await accionRegistrarCompra({
        proveedorId,
        depositoId,
        numeroFactura: factura,
        fecha,
        lineas: lineas.map((l) => ({
          insumoId: l.insumoId,
          presentacionId: l.presentacionId,
          cantidadPresentaciones: numeroDesdeTexto(l.cantidad || '0') ?? 0,
          costoCentavos: centavosDesdeTexto(l.costo || '0') ?? 0,
        })),
      });
      if (!resultado.ok) return setError(resultado.error);
      toast.exito('Compra registrada', 'El stock y el costo promedio quedaron actualizados.');
      alCerrar();
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Nueva compra">
      <div className="modal-cuerpo flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiqueta-campo">Proveedor</label>
            <Selector opciones={stock.proveedores.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} valor={proveedorId} alElegir={setProveedorId} buscador vacio="Cargá un proveedor desde Stock" />
          </div>
          <div>
            <label className="etiqueta-campo">Entra a</label>
            <Selector opciones={stock.depositos.map((d) => ({ valor: d.id, etiqueta: d.nombre }))} valor={depositoId} alElegir={setDepositoId} />
          </div>
          <Campo etiqueta="Número de factura" value={factura} onChange={(e) => setFactura(e.target.value)} required />
          <Campo etiqueta="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </div>
        <div>
          <div className="mb-1 grid grid-cols-[1fr_1fr_5rem_7rem_2rem] gap-2 text-xs text-tinta-tenue">
            <span>Insumo</span>
            <span>Presentación</span>
            <span className="text-right">Cantidad</span>
            <span className="text-right">Costo total</span>
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
                  <NumeroInline etiqueta="Costo total" valor={l.costo} alCambiar={(costo) => cambiar(l.clave, { costo })} decimales={2} />
                  <Boton variante="fantasma" tamano="sm" soloIcono aria-label="Quitar línea" onClick={() => setLineas(lineas.filter((x) => x.clave !== l.clave))} disabled={lineas.length === 1}>
                    <X size={14} strokeWidth={1.5} />
                  </Boton>
                </div>
              );
            })}
          </div>
          <Boton
            variante="fantasma"
            tamano="sm"
            className="mt-2"
            onClick={() => setLineas([...lineas, { clave: crypto.randomUUID(), insumoId: null, presentacionId: null, cantidad: '', costo: '' }])}
          >
            <Plus size={14} strokeWidth={1.5} /> Línea
          </Boton>
        </div>
        <div className="flex items-baseline justify-between border-t border-borde pt-3">
          <span className="text-sm text-tinta-suave">Total de la factura</span>
          <span className="text-lg font-semibold tabular-nums text-tinta">{pesosDesdeCentavos(total)}</span>
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={guardar} cargando={guardando}>
          Registrar compra
        </Boton>
      </footer>
    </Modal>
  );
}

export function PantallaCompras({ compras, stock }: { compras: FilaCompra[]; stock: Stock }) {
  const [nueva, setNueva] = useState(false);
  return (
    <>
      <TituloSeccion
        accion={
          <Boton variante="primario" onClick={() => setNueva(true)}>
            <Plus size={15} strokeWidth={1.75} /> Nueva compra
          </Boton>
        }
      >
        Compras
      </TituloSeccion>
      <Tarjeta>
        {compras.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay compras registradas" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Proveedor</Th>
                <Th>Factura</Th>
                <Th>Depósito</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id}>
                  <Td className="tabular-nums">{fechaCorta(c.fecha)}</Td>
                  <Td className="font-medium">{c.proveedor}</Td>
                  <Td className="text-tinta-suave">{c.numeroFactura}</Td>
                  <Td className="text-tinta-suave">{c.deposito}</Td>
                  <Td className="text-right tabular-nums">{pesosDesdeCentavos(c.totalCentavos)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
      {nueva ? <ModalCompra stock={stock} alCerrar={() => setNueva(false)} /> : null}
    </>
  );
}
