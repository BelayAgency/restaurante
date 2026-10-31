'use client';

import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, Factory, Package, PackageMinus, Search, Truck } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Miniatura } from '@/components/foto-producto';
import { NivelStock } from '@/components/nivel-stock';
import { urlFotoInsumo } from '@/dominio/catalogo';
import { EstadoVacio, Insignia, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { formatearCantidad, formatearConUnidades } from '@/dominio/stock';
import type { Productos } from '@/servidor/productos';
import type { Stock } from '@/servidor/stock';
import { useSesion } from '../sesion-cliente';
import { ModalProducto } from './modal-producto';
import { ModalMovimiento, type Movimiento } from './modales-movimiento';

type Insumo = Stock['insumos'][number];

export function PantallaStock({
  stock,
  productos,
  filas,
  buscando,
  buscador,
  paginacion,
}: {
  stock: Stock;
  /** Para abrir la ficha de un producto: sólo quien administra. */
  productos: Productos | null;
  /** La página de la tabla, ya filtrada en el servidor. */
  filas: Insumo[];
  buscando: string;
  buscador: ReactNode;
  paginacion: ReactNode;
}) {
  const { usuario } = useSesion();
  const administra = puede(usuario, 'stock.administrar');
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const abierto = productos?.conStock.find((p) => p.id === abiertoId);
  const [movimiento, setMovimiento] = useState<Movimiento | null>(null);
  const bajos = stock.insumos.filter((i) => i.bajoMinimo).length;
  const nivel = (i: Insumo) => (
    <NivelStock cantidad={i.total} minimo={i.stockMinimo} texto={formatearConUnidades(i.total, i.unidad, i.contenidoPorUnidad)} textoMinimo={formatearCantidad(i.stockMinimo, i.unidad)} />
  );

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
            </div>
          ) : null
        }
      >
        Stock
      </TituloSeccion>

      {/* Un solo bloque: sueltos, el contenedor de la página les pone su separación grande entre cada uno. */}
      <div>
        {stock.insumos.length ? <div className="mb-3">{buscador}</div> : null}

        <Tarjeta>
          {stock.insumos.length === 0 ? (
            <EstadoVacio titulo="Todavía no hay insumos" detalle="Se cargan desde Productos, como productos con stock." />
          ) : filas.length === 0 ? (
            <EstadoVacio icono={<Search size={28} strokeWidth={1.5} />} titulo={`Ningún insumo coincide con «${buscando}»`} />
          ) : (
            <div className="overflow-x-auto">
              <Tabla>
                <thead>
                  <tr>
                    <Th>Insumo</Th>
                    <Th className="max-sm:hidden">Nivel</Th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((i) => (
                    <tr key={i.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Miniatura
                            url={i.fotoVersion ? urlFotoInsumo(i.id, i.fotoVersion) : null}
                            icono={<Package size={16} strokeWidth={1.5} aria-hidden="true" />}
                            className="size-10 rounded-lg"
                          />
                          <div className="min-w-0 flex-1">
                            {administra ? (
                              <button type="button" onClick={() => setAbiertoId(i.id)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-tinta hover:text-acento">
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
                            {/* En el teléfono el nivel va debajo del nombre: en su columna, la barra quedaba cortada al costado. */}
                            <div className="mt-1.5 sm:hidden">{nivel(i)}</div>
                          </div>
                        </div>
                      </Td>
                      <Td className="max-sm:hidden">{nivel(i)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </div>
          )}
        </Tarjeta>
        <div className="mt-4 empty:hidden">{paginacion}</div>
      </div>

      {abierto && productos ? <ModalProducto key={abierto.id} abierto={{ tipo: 'stock', producto: abierto }} productos={productos} alCerrar={() => setAbiertoId(null)} /> : null}
      {movimiento ? <ModalMovimiento tipo={movimiento} stock={stock} alCerrar={() => setMovimiento(null)} /> : null}
    </>
  );
}
