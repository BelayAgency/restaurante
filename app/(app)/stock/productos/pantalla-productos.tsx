'use client';

import { useState } from 'react';
import { CookingPot, Package, Plus, Search } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Miniatura } from '@/components/foto-producto';
import { EstadoVacio, Insignia, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import { urlFotoInsumo, urlFotoProducto } from '@/dominio/catalogo';
import { formatearCantidad, formatearConUnidades } from '@/dominio/stock';
import { pesosDesdeCentavos } from '@/lib/formato';
import { normalizar } from '@/lib/texto';
import type { Productos } from '@/servidor/productos';
import { ModalProducto, type ProductoAbierto } from '../modal-producto';

/** Todos los productos juntos, con stock y con receta, en orden alfabético. */
export function PantallaProductos({ productos }: { productos: Productos }) {
  const [buscar, setBuscar] = useState('');
  // `undefined`: cerrado; `null`: uno nuevo.
  const [abierto, setAbierto] = useState<ProductoAbierto | undefined>();
  const buscado = normalizar(buscar);
  const insumo = (id: string) => productos.conStock.find((p) => p.id === id);

  const filas: Exclude<ProductoAbierto, null>[] = [
    ...productos.conStock.filter((p) => p.tipo === 'compra').map((producto) => ({ tipo: 'stock' as const, producto })),
    ...productos.conReceta.map((producto) => ({ tipo: 'receta' as const, producto })),
  ]
    .filter((f) => !buscado || normalizar(f.producto.nombre).includes(buscado))
    .sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));

  return (
    <>
      <TituloSeccion
        accion={
          <Boton variante="primario" tamano="sm" onClick={() => setAbierto(null)}>
            <Plus size={14} strokeWidth={1.75} /> Producto
          </Boton>
        }
      >
        Productos
      </TituloSeccion>
      <div className="relative mb-3 w-full max-w-xs">
        <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-tinta-tenue" />
        <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" className="campo pl-9" />
      </div>
      <Tarjeta padding={false}>
        {filas.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EstadoVacio icono={<Package size={28} strokeWidth={1.5} />} titulo={buscado ? 'Ningún producto coincide' : 'Todavía no hay productos'} />
          </div>
        ) : (
          <div className="overflow-x-auto px-4 py-1 sm:px-5">
            <Tabla>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th className="max-sm:hidden">Tipo</Th>
                  <Th className="max-sm:hidden">Stock o receta</Th>
                  <Th className="text-right">Precio</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const venta = f.tipo === 'stock' ? f.producto.venta : f.producto;
                  const detalle =
                    f.tipo === 'stock'
                      ? formatearConUnidades(f.producto.total, f.producto.unidad, f.producto.contenidoPorUnidad)
                      : f.producto.lineas
                          .map((l) => {
                            const i = insumo(l.insumoId);
                            return i ? `${i.nombre} ${formatearCantidad(l.cantidad, i.unidad)}` : null;
                          })
                          .filter(Boolean)
                          .join(' · ');
                  return (
                    <tr key={f.producto.id} onClick={() => setAbierto(f)} className="cursor-pointer hover:bg-lienzo">
                      <Td>
                        <div className="flex items-center gap-3">
                          <Miniatura
                            url={
                              f.producto.fotoVersion
                                ? f.tipo === 'stock'
                                  ? urlFotoInsumo(f.producto.id, f.producto.fotoVersion)
                                  : urlFotoProducto(f.producto.id, f.producto.fotoVersion)
                                : null
                            }
                            icono={f.tipo === 'stock' ? <Package size={16} strokeWidth={1.5} aria-hidden="true" /> : <CookingPot size={16} strokeWidth={1.5} aria-hidden="true" />}
                            className="size-10 rounded-lg"
                          />
                          <div className="min-w-0">
                            <span className="font-medium text-tinta">{f.producto.nombre}</span>
                            {/* En el teléfono, el tipo y el stock o la receta van debajo del nombre, en vez de en sus columnas. */}
                            <p className="line-clamp-2 text-xs text-tinta-tenue sm:hidden">
                              {f.tipo === 'stock' ? 'Con stock' : 'Con receta'}
                              {detalle ? ` · ${detalle}` : ''}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td className="max-sm:hidden">
                        <Insignia tono="neutro" className="whitespace-nowrap">{f.tipo === 'stock' ? 'Con stock' : 'Con receta'}</Insignia>
                      </Td>
                      <Td className="text-tinta-suave max-sm:hidden">{detalle || <Insignia tono="alerta">Sin receta</Insignia>}</Td>
                      <Td className="whitespace-nowrap text-right tabular-nums">{venta?.vendible ? pesosDesdeCentavos(venta.precioCentavos) : <span className="text-tinta-tenue">No se vende</span>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          </div>
        )}
      </Tarjeta>
      {abierto !== undefined ? <ModalProducto key={abierto?.producto.id ?? 'nuevo'} abierto={abierto} productos={productos} alCerrar={() => setAbierto(undefined)} /> : null}
    </>
  );
}
