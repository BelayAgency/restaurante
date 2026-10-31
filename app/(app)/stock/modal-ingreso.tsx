'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Package, Search, X } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Miniatura } from '@/components/foto-producto';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { useToast } from '@/components/toast';
import { urlFotoInsumo } from '@/dominio/catalogo';
import { formatearCantidad, NOMBRE_UNIDAD } from '@/dominio/stock';
import { numeroDesdeTexto } from '@/lib/formato';
import { normalizar } from '@/lib/texto';
import type { Stock } from '@/servidor/stock';
import { accionIngresarStock } from './acciones';

type Insumo = Stock['insumos'][number];

const RESULTADOS = 6;

/**
 * Sumar mercadería a varios productos de una vez: se busca, se toca para
 * agregarlo como fila y se pone cuánto entra. Con composición declarada se
 * carga en unidades (6 botellas), que es como se cuenta lo que llega; el
 * sistema lo pasa a la medida del stock (4.500 ml).
 */
export function ModalIngreso({ stock, alCerrar }: { stock: Stock; alCerrar: () => void }) {
  const toast = useToast();
  const [buscar, setBuscar] = useState('');
  const [filas, setFilas] = useState<{ insumo: Insumo; cantidad: string }[]>([]);
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();
  const [enfocado, setEnfocado] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; left: number; width: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const buscado = normalizar(buscar);
  const resultados = buscado
    ? stock.insumos.filter((i) => i.tipo === 'compra' && !filas.some((f) => f.insumo.id === i.id) && normalizar(i.nombre).includes(buscado)).slice(0, RESULTADOS)
    : [];
  const medida = (i: Insumo) => (i.contenidoPorUnidad ? 'u.' : NOMBRE_UNIDAD[i.unidad]);
  const enStock = (i: Insumo, cantidad: string) => (numeroDesdeTexto(cantidad || '0') ?? 0) * (i.contenidoPorUnidad ?? 1);

  const abierto = enfocado && buscado !== '';

  // La lista flota debajo del buscador con `fixed`, medida contra él, como el Selector: no
  // empuja las filas, y el scroll propio del cuerpo del modal no la recorta.
  useEffect(() => {
    if (!abierto) return;
    const medir = () => {
      const rect = caja.current?.getBoundingClientRect();
      if (rect) setPosicion({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    };
    medir();
    // El modal va centrado: cuando crece con una fila nueva se corre para arriba, y el buscador con él.
    const cambios = new ResizeObserver(medir);
    const dialogo = caja.current?.closest('dialog');
    if (dialogo) cambios.observe(dialogo);
    window.addEventListener('scroll', medir, true);
    window.addEventListener('resize', medir);
    return () => {
      cambios.disconnect();
      window.removeEventListener('scroll', medir, true);
      window.removeEventListener('resize', medir);
    };
  }, [abierto]);

  function agregar(insumo: Insumo) {
    setFilas([...filas, { insumo, cantidad: '' }]);
    setBuscar('');
    setError(undefined);
  }

  function guardar() {
    if (filas.some((f) => enStock(f.insumo, f.cantidad) <= 0)) return setError('Cada producto necesita la cantidad que entra');
    iniciar(async () => {
      const resultado = await accionIngresarStock({ lineas: filas.map((f) => ({ insumoId: f.insumo.id, cantidad: enStock(f.insumo, f.cantidad) })) });
      if (!resultado.ok) return setError(resultado.error);
      toast.exito(filas.length === 1 ? 'Stock añadido' : `Stock añadido a ${filas.length} productos`);
      alCerrar();
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Añadir stock">
      <div className="modal-cuerpo flex flex-col gap-4">
        <div ref={caja}>
          <div className="relative">
            <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-tinta-tenue" />
            <input
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => {
                // Enter suma el primero de la lista: se carga una entrega sin soltar el teclado.
                if (e.key === 'Enter' && resultados[0]) {
                  e.preventDefault();
                  agregar(resultados[0]);
                }
              }}
              placeholder="Buscar producto"
              aria-label="Buscar producto"
              onFocus={() => setEnfocado(true)}
              onBlur={() => setEnfocado(false)}
              className="campo pl-9"
              data-foco-inicial
            />
          </div>
          {abierto && posicion ? (
            <ul
              className="fixed z-50 max-h-72 overflow-y-auto rounded-xl border border-borde bg-elevada py-1 shadow-flotante"
              style={posicion}
              // Que tocar un resultado no le saque el foco al buscador antes del click.
              onPointerDown={(e) => e.preventDefault()}
            >
              {resultados.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-tinta-tenue">Ningún producto con stock coincide</li>
              ) : (
                resultados.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => agregar(i)}
                      className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3 py-2 text-left transition-colors hover:bg-fill-fantasma-hover"
                    >
                      <Miniatura
                        url={i.fotoVersion ? urlFotoInsumo(i.id, i.fotoVersion) : null}
                        icono={<Package size={14} strokeWidth={1.5} aria-hidden="true" />}
                        className="size-8 rounded-lg"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-tinta">{i.nombre}</span>
                      <span className="shrink-0 text-xs tabular-nums text-tinta-tenue">Hay {formatearCantidad(i.total, i.unidad)}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>

        {filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-tinta-tenue">Buscá un producto para empezar.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filas.map((f) => {
              const suma = enStock(f.insumo, f.cantidad);
              return (
                <li key={f.insumo.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-tinta">{f.insumo.nombre}</p>
                    <p className="truncate text-xs tabular-nums text-tinta-tenue">
                      {f.insumo.contenidoPorUnidad && suma > 0
                        ? `= ${formatearCantidad(suma, f.insumo.unidad)} · queda ${formatearCantidad(f.insumo.total + suma, f.insumo.unidad)}`
                        : suma > 0
                          ? `Queda ${formatearCantidad(f.insumo.total + suma, f.insumo.unidad)}`
                          : `Hay ${formatearCantidad(f.insumo.total, f.insumo.unidad)}`}
                    </p>
                  </div>
                  <NumeroInline
                    etiqueta={`Cantidad de ${f.insumo.nombre}`}
                    valor={f.cantidad}
                    alCambiar={(cantidad) => setFilas(filas.map((x) => (x.insumo.id === f.insumo.id ? { ...x, cantidad } : x)))}
                    decimales={f.insumo.contenidoPorUnidad || f.insumo.unidad === 'u' ? 0 : 3}
                    className="w-24"
                  />
                  <span className="w-10 text-xs text-tinta-tenue">{medida(f.insumo)}</span>
                  <Boton variante="fantasma" tamano="sm" soloIcono aria-label={`Quitar ${f.insumo.nombre}`} onClick={() => setFilas(filas.filter((x) => x.insumo.id !== f.insumo.id))}>
                    <X size={14} strokeWidth={1.5} />
                  </Boton>
                </li>
              );
            })}
          </ul>
        )}
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={guardar} cargando={guardando} disabled={!filas.length}>
          Añadir{filas.length > 1 ? ` (${filas.length})` : ''}
        </Boton>
      </footer>
    </Modal>
  );
}
