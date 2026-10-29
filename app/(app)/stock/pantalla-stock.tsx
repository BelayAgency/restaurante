'use client';

import { useState } from 'react';
import { ArrowLeftRight, Factory, PackageMinus, Plus, Truck } from 'lucide-react';
import { Boton } from '@/components/boton';
import { EstadoVacio, Insignia, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { formatearCantidad } from '@/dominio/stock';
import { pesosDesdeCentavos } from '@/lib/formato';
import type { Stock } from '@/servidor/stock';
import { useSesion } from '../sesion-cliente';
import { ModalInsumo } from './modal-insumo';
import { ModalMovimiento, type Movimiento } from './modales-movimiento';

export function PantallaStock({ stock }: { stock: Stock }) {
  const { usuario } = useSesion();
  const administra = puede(usuario, 'stock.administrar');
  // `undefined`: cerrado; `null`: uno nuevo.
  const [insumo, setInsumo] = useState<Stock['insumos'][number] | null>();
  const [movimiento, setMovimiento] = useState<Movimiento | null>(null);
  const bajos = stock.insumos.filter((i) => i.bajoMinimo).length;

  return (
    <>
      <TituloSeccion
        descripcion={bajos ? `${bajos} ${bajos === 1 ? 'insumo está' : 'insumos están'} por debajo del mínimo.` : undefined}
        accion={
          administra ? (
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" tamano="sm" onClick={() => setMovimiento('produccion')}>
                <Factory size={14} strokeWidth={1.5} /> Producción
              </Boton>
              <Boton variante="secundario" tamano="sm" onClick={() => setMovimiento('transferencia')}>
                <ArrowLeftRight size={14} strokeWidth={1.5} /> Transferir
              </Boton>
              <Boton variante="secundario" tamano="sm" onClick={() => setMovimiento('baja')}>
                <PackageMinus size={14} strokeWidth={1.5} /> Baja
              </Boton>
              <Boton variante="secundario" tamano="sm" onClick={() => setMovimiento('proveedor')}>
                <Truck size={14} strokeWidth={1.5} /> Proveedor
              </Boton>
              <Boton variante="primario" tamano="sm" onClick={() => setInsumo(null)}>
                <Plus size={14} strokeWidth={1.75} /> Insumo
              </Boton>
            </div>
          ) : null
        }
      >
        Stock
      </TituloSeccion>

      <Tarjeta>
        {stock.insumos.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay insumos" detalle="Cargalos con su unidad y cómo se compran; después armá las recetas." />
        ) : (
          <div className="overflow-x-auto">
            <Tabla>
              <thead>
                <tr>
                  <Th>Insumo</Th>
                  {stock.depositos.map((d) => (
                    <Th key={d.id} className="text-right">
                      {d.nombre}
                    </Th>
                  ))}
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Costo</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {stock.insumos.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      {administra ? (
                        <button type="button" onClick={() => setInsumo(i)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-tinta hover:text-acento">
                          {i.nombre}
                        </button>
                      ) : (
                        <span className="font-medium">{i.nombre}</span>
                      )}
                      {i.tipo === 'preparacion' ? (
                        <Insignia tono="neutro" className="ml-2">
                          Preparación
                        </Insignia>
                      ) : null}
                      {i.bajoMinimo ? (
                        <Insignia tono="alerta" className="ml-2">
                          Bajo mínimo
                        </Insignia>
                      ) : null}
                    </Td>
                    {stock.depositos.map((d) => (
                      <Td key={d.id} className="text-right tabular-nums text-tinta-suave">
                        {i.porDeposito[d.id] ? formatearCantidad(i.porDeposito[d.id]!, i.unidad) : '—'}
                      </Td>
                    ))}
                    <Td className={i.total < 0 ? 'text-right tabular-nums text-error' : 'text-right tabular-nums'}>{formatearCantidad(i.total, i.unidad)}</Td>
                    <Td className="text-right tabular-nums text-tinta-suave">
                      {pesosDesdeCentavos(Math.round(i.costoUnitario * (i.unidad === 'u' ? 1 : 1000)))}
                      <span className="text-xs">/{i.unidad === 'g' ? 'kg' : i.unidad === 'ml' ? 'l' : 'u.'}</span>
                    </Td>
                    <Td className="text-right tabular-nums">{pesosDesdeCentavos(Math.round(Math.max(i.total, 0) * i.costoUnitario))}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </div>
        )}
      </Tarjeta>

      {insumo !== undefined ? <ModalInsumo key={insumo?.id ?? 'nuevo'} insumo={insumo} alCerrar={() => setInsumo(undefined)} /> : null}
      {movimiento ? <ModalMovimiento tipo={movimiento} stock={stock} alCerrar={() => setMovimiento(null)} /> : null}
    </>
  );
}
