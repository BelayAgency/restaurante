'use client';

import { useMemo, useState, useTransition } from 'react';
import { Minus, Plus, Search } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { EstadoVacio } from '@/components/ui';
import type { Catalogo, GrupoCatalogo, ProductoCatalogo } from '@/dominio/catalogo';
import { pesosDesdeCentavos } from '@/lib/formato';
import { cn } from '@/lib/cn';
import { useRegistrar, type Operador } from './contexto';

/** Elegir de la carta y cargar a la cuenta. Funciona con la carta guardada en el dispositivo. */
export function AgregarItems({
  abierto,
  alCerrar,
  cuentaId,
  catalogo,
  operador,
}: {
  abierto: boolean;
  alCerrar: () => void;
  cuentaId: string;
  catalogo: Catalogo;
  operador: Operador;
}) {
  const [categoriaId, setCategoriaId] = useState<string | null>(catalogo.categorias[0]?.id ?? null);
  const [busqueda, setBusqueda] = useState('');
  const [eligiendo, setEligiendo] = useState<ProductoCatalogo | null>(null);
  const [cargados, setCargados] = useState(0);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return catalogo.productos.filter((p) => p.disponible && (texto ? p.nombre.toLowerCase().includes(texto) : p.categoriaId === categoriaId));
  }, [catalogo.productos, busqueda, categoriaId]);

  return (
    <>
      <Modal abierto={abierto && !eligiendo} alCerrar={alCerrar} titulo="Cargar a la cuenta">
        <div className="modal-cuerpo flex flex-col gap-3">
          <div className="relative">
            <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-tinta-tenue" />
            <input className="campo pl-9" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en la carta" aria-label="Buscar en la carta" />
          </div>
          {!busqueda ? (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {catalogo.categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoriaId(c.id)}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-full border-0 px-3 py-1.5 text-sm transition-colors',
                    c.id === categoriaId ? 'bg-acento text-white' : 'bg-fill-secundario text-tinta hover:bg-fill-secundario-hover',
                  )}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          ) : null}
          {visibles.length === 0 ? (
            <EstadoVacio titulo={busqueda ? 'No hay nada con ese nombre' : 'No hay productos disponibles en esta categoría'} />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setEligiendo(p)}
                  className="flex min-h-20 cursor-pointer flex-col justify-between rounded-lg border border-borde bg-elevada p-3 text-left transition-colors hover:border-acento"
                >
                  <span className="text-sm font-medium text-tinta">{p.nombre}</span>
                  <span className="text-xs tabular-nums text-tinta-tenue">{pesosDesdeCentavos(p.precioCentavos)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <footer className="modal-pie">
          {cargados > 0 ? <span className="mr-auto text-sm text-tinta-tenue">{cargados === 1 ? '1 ítem cargado' : `${cargados} ítems cargados`}</span> : null}
          <Boton variante="primario" onClick={alCerrar}>
            Listo
          </Boton>
        </footer>
      </Modal>

      {eligiendo ? (
        <ModalItem
          key={eligiendo.id}
          producto={eligiendo}
          grupos={eligiendo.grupoIds.map((id) => catalogo.grupos.find((g) => g.id === id)).filter((g): g is GrupoCatalogo => !!g)}
          cuentaId={cuentaId}
          operador={operador}
          alCerrar={(cargo) => {
            if (cargo) setCargados((n) => n + 1);
            setEligiendo(null);
          }}
        />
      ) : null}
    </>
  );
}

function ModalItem({
  producto,
  grupos,
  cuentaId,
  operador,
  alCerrar,
}: {
  producto: ProductoCatalogo;
  grupos: GrupoCatalogo[];
  cuentaId: string;
  operador: Operador;
  alCerrar: (cargo: boolean) => void;
}) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [elegidos, setElegidos] = useState<Record<string, string[]>>({});
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState('');
  const [guardando, iniciar] = useTransition();

  const faltan = grupos.filter((g) => g.obligatorio && !(elegidos[g.id]?.length));
  const modificadores = grupos.flatMap((g) => g.modificadores.filter((m) => elegidos[g.id]?.includes(m.id)));
  const unitario = producto.precioCentavos + modificadores.reduce((s, m) => s + m.precioCentavos, 0);

  function alternar(grupo: GrupoCatalogo, id: string) {
    const actuales = elegidos[grupo.id] ?? [];
    const siguientes = actuales.includes(id) ? actuales.filter((x) => x !== id) : grupo.multiple ? [...actuales, id] : [id];
    setElegidos({ ...elegidos, [grupo.id]: siguientes });
  }

  function cargar() {
    if (faltan.length) return toast.alerta(`Falta elegir: ${faltan.map((g) => g.nombre).join(', ')}`);
    iniciar(async () => {
      const ok = await registrar('item_agregado', cuentaId, {
        itemId: crypto.randomUUID(),
        productoId: producto.id,
        precioId: producto.precioId,
        nombre: producto.nombre,
        precioCentavos: producto.precioCentavos,
        estacionId: producto.estacionId,
        cantidad,
        modificadores: modificadores.map((m) => ({ modificadorId: m.id, nombre: m.nombre, precioCentavos: m.precioCentavos })),
        nota: nota.trim() || null,
      });
      alCerrar(ok);
    });
  }

  return (
    <Modal abierto alCerrar={() => alCerrar(false)} titulo={producto.nombre}>
      <div className="modal-cuerpo flex flex-col gap-4">
        {grupos.map((g) => (
          <fieldset key={g.id}>
            <legend className="etiqueta-campo">
              {g.nombre}
              {g.obligatorio ? <span className="ml-1 text-xs text-tinta-tenue">(obligatorio)</span> : null}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {g.modificadores.map((m) => {
                const activo = elegidos[g.id]?.includes(m.id) ?? false;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => alternar(g, m.id)}
                    className={cn(
                      'cursor-pointer rounded-full border-0 px-3 py-2 text-sm transition-colors',
                      activo ? 'bg-acento text-white' : 'bg-fill-secundario text-tinta hover:bg-fill-secundario-hover',
                    )}
                  >
                    {m.nombre}
                    {m.precioCentavos ? ` +${pesosDesdeCentavos(m.precioCentavos)}` : ''}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <div>
          <p className="etiqueta-campo">Cantidad</p>
          <div className="flex items-center gap-3">
            <Boton type="button" variante="secundario" tamano="lg" soloIcono aria-label="Uno menos" onClick={() => setCantidad(Math.max(1, cantidad - 1))}>
              <Minus size={18} strokeWidth={1.5} />
            </Boton>
            <span className="w-10 text-center text-2xl font-semibold tabular-nums text-tinta" aria-live="polite">
              {cantidad}
            </span>
            <Boton type="button" variante="secundario" tamano="lg" soloIcono aria-label="Uno más" onClick={() => setCantidad(Math.min(99, cantidad + 1))}>
              <Plus size={18} strokeWidth={1.5} />
            </Boton>
          </div>
        </div>
        <Campo etiqueta="Nota para cocina" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={140} />
      </div>
      <footer className="modal-pie">
        <Boton type="button" variante="secundario" onClick={() => alCerrar(false)} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton type="button" variante="primario" onClick={cargar} cargando={guardando}>
          Cargar · {pesosDesdeCentavos(unitario * cantidad)}
        </Boton>
      </footer>
    </Modal>
  );
}
