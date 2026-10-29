'use client';

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { EstadoVacio, Insignia, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import { costoPorcion, NOMBRE_UNIDAD, type LineaReceta } from '@/dominio/stock';
import { numeroDesdeTexto, pesosDesdeCentavos, textoDesdeNumero } from '@/lib/formato';
import type { Recetas } from '@/servidor/stock';
import { accionGuardarReceta } from '../acciones';

// Por encima de esto, el plato se lleva demasiado de su precio en mercadería.
const FOOD_COST_ALTO = 35;

interface Editando {
  productoId: string | null;
  preparacionId: string | null;
  titulo: string;
  rendimiento: number;
  unidadRendimiento: string | null;
  lineas: LineaReceta[];
}

function ModalReceta({ editando, recetas, alCerrar }: { editando: Editando; recetas: Recetas; alCerrar: () => void }) {
  const toast = useToast();
  const [lineas, setLineas] = useState(
    editando.lineas.map((l) => ({ clave: crypto.randomUUID(), insumoId: l.insumoId as string | null, cantidad: textoDesdeNumero(l.cantidad), merma: textoDesdeNumero(l.mermaPorcentaje) })),
  );
  const [rendimiento, setRendimiento] = useState(textoDesdeNumero(editando.rendimiento));
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  const opciones = recetas.insumos.filter((i) => i.id !== editando.preparacionId).map((i) => ({ valor: i.id, etiqueta: i.nombre, detalle: NOMBRE_UNIDAD[i.unidad] }));
  const convertidas = lineas
    .filter((l) => l.insumoId)
    .map((l) => ({ insumoId: l.insumoId!, cantidad: numeroDesdeTexto(l.cantidad || '0') ?? 0, mermaPorcentaje: numeroDesdeTexto(l.merma || '0') ?? 0 }));
  const costo = costoPorcion(convertidas, numeroDesdeTexto(rendimiento || '1') || 1, (id) => recetas.insumos.find((i) => i.id === id)?.costoUnitario ?? 0);

  function guardar() {
    if (convertidas.some((l) => l.cantidad <= 0)) return setError('Cada insumo necesita su cantidad');
    iniciar(async () => {
      const resultado = await accionGuardarReceta({
        productoId: editando.productoId,
        preparacionId: editando.preparacionId,
        rendimiento: numeroDesdeTexto(rendimiento || '1') || 1,
        lineas: convertidas,
      });
      if (!resultado.ok) return setError(resultado.error);
      toast.exito('Receta guardada', 'La anterior queda en el historial: las ventas viejas se calculan con ella.');
      alCerrar();
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo={`Receta · ${editando.titulo}`}>
      <div className="modal-cuerpo flex flex-col gap-4">
        {editando.preparacionId ? (
          <CampoNumero etiqueta={`Rinde (${editando.unidadRendimiento ?? ''})`} valor={rendimiento} alCambiar={setRendimiento} decimales={3} placeholder="0" />
        ) : null}
        <div>
          <div className="mb-1 grid grid-cols-[1fr_7rem_5rem_2rem] gap-2 text-xs text-tinta-tenue">
            <span>Insumo</span>
            <span className="text-right">Cantidad neta</span>
            <span className="text-right">Merma %</span>
          </div>
          <div className="flex flex-col gap-2">
            {lineas.map((l) => {
              const unidad = recetas.insumos.find((i) => i.id === l.insumoId)?.unidad;
              return (
                <div key={l.clave} className="grid grid-cols-[1fr_7rem_5rem_2rem] items-center gap-2">
                  <Selector opciones={opciones} valor={l.insumoId} alElegir={(insumoId) => setLineas(lineas.map((x) => (x.clave === l.clave ? { ...x, insumoId } : x)))} buscador />
                  <NumeroInline
                    etiqueta={`Cantidad${unidad ? ` (${NOMBRE_UNIDAD[unidad]})` : ''}`}
                    valor={l.cantidad}
                    alCambiar={(cantidad) => setLineas(lineas.map((x) => (x.clave === l.clave ? { ...x, cantidad } : x)))}
                    decimales={3}
                  />
                  <NumeroInline etiqueta="Merma" valor={l.merma} alCambiar={(merma) => setLineas(lineas.map((x) => (x.clave === l.clave ? { ...x, merma } : x)))} decimales={1} />
                  <Boton variante="fantasma" tamano="sm" soloIcono aria-label="Quitar insumo" onClick={() => setLineas(lineas.filter((x) => x.clave !== l.clave))}>
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
            onClick={() => setLineas([...lineas, { clave: crypto.randomUUID(), insumoId: null, cantidad: '', merma: '0' }])}
            disabled={!recetas.insumos.length}
          >
            <Plus size={14} strokeWidth={1.5} /> Insumo
          </Boton>
        </div>
        <div className="flex items-baseline justify-between border-t border-borde pt-3">
          <span className="text-sm text-tinta-suave">Costo {editando.preparacionId ? `por ${editando.unidadRendimiento}` : 'por porción'}</span>
          <span className="text-lg font-semibold tabular-nums text-tinta">{pesosDesdeCentavos(Math.round(costo))}</span>
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={guardar} cargando={guardando}>
          Guardar receta
        </Boton>
      </footer>
    </Modal>
  );
}

export function PantallaRecetas({ recetas }: { recetas: Recetas }) {
  const [editando, setEditando] = useState<Editando | null>(null);

  return (
    <>
      <TituloSeccion descripcion="El costo teórico de cada plato sale de su receta y del costo promedio de los insumos.">Recetas</TituloSeccion>
      <Tarjeta>
        {recetas.productos.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay productos en la carta" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th className="text-right">Precio</Th>
                <Th className="text-right">Costo</Th>
                <Th className="text-right">Food cost</Th>
                <Th className="text-right">Margen</Th>
              </tr>
            </thead>
            <tbody>
              {recetas.productos.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setEditando({ productoId: p.id, preparacionId: null, titulo: p.nombre, rendimiento: 1, unidadRendimiento: null, lineas: p.lineas })}
                      className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-tinta hover:text-acento"
                    >
                      {p.nombre}
                    </button>
                    {!p.lineas.length ? (
                      <Insignia tono="alerta" className="ml-2">
                        Sin receta
                      </Insignia>
                    ) : null}
                  </Td>
                  <Td className="text-right tabular-nums">{pesosDesdeCentavos(p.precioCentavos)}</Td>
                  <Td className="text-right tabular-nums">{p.costoCentavos === null ? '—' : pesosDesdeCentavos(Math.round(p.costoCentavos))}</Td>
                  <Td className="text-right tabular-nums">
                    {p.foodCost === null ? '—' : <Insignia tono={p.foodCost > FOOD_COST_ALTO ? 'error' : 'exito'}>{p.foodCost.toFixed(1).replace('.', ',')} %</Insignia>}
                  </Td>
                  <Td className="text-right tabular-nums">{p.costoCentavos === null ? '—' : pesosDesdeCentavos(Math.round(p.precioCentavos - p.costoCentavos))}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <section className="mt-8">
        <TituloSeccion descripcion="Salsas, masas, fondos: se elaboran con su propia receta y entran al stock como un insumo más.">Preparaciones</TituloSeccion>
        <Tarjeta>
          {recetas.preparaciones.length === 0 ? (
            <EstadoVacio titulo="No hay preparaciones" detalle="Se crean desde Stock, como un insumo de tipo «se elabora»." />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Preparación</Th>
                  <Th className="text-right">Rinde</Th>
                  <Th className="text-right">Insumos</Th>
                </tr>
              </thead>
              <tbody>
                {recetas.preparaciones.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <button
                        type="button"
                        onClick={() =>
                          setEditando({ productoId: null, preparacionId: p.id, titulo: p.nombre, rendimiento: p.rendimiento, unidadRendimiento: NOMBRE_UNIDAD[p.unidad], lineas: p.lineas })
                        }
                        className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-tinta hover:text-acento"
                      >
                        {p.nombre}
                      </button>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {textoDesdeNumero(p.rendimiento)} {NOMBRE_UNIDAD[p.unidad]}
                    </Td>
                    <Td className="text-right tabular-nums">{p.lineas.length}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
      </section>

      {editando ? <ModalReceta key={editando.productoId ?? editando.preparacionId} editando={editando} recetas={recetas} alCerrar={() => setEditando(null)} /> : null}
    </>
  );
}
