'use client';

import { useMemo, useState, useTransition, type KeyboardEvent } from 'react';
import { ChefHat, MessageSquareText, Minus, Plus, Search, ShoppingBasket, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { FotoProducto } from '@/components/foto-producto';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { EstadoVacio } from '@/components/ui';
import type { Catalogo, GrupoCatalogo, ModificadorCatalogo, ProductoCatalogo } from '@/dominio/catalogo';
import type { Item } from '@/dominio/reductores/salon';
import { pesosDesdeCentavos } from '@/lib/formato';
import { cn } from '@/lib/cn';
import { normalizar } from '@/lib/texto';
import { useRegistrar, type Operador } from './contexto';

/** Un renglón de la orden que se está armando: todavía no es un evento. */
interface LineaOrden {
  clave: string;
  producto: ProductoCatalogo;
  cantidad: number;
  modificadores: ModificadorCatalogo[];
  nota: string | null;
  /** Si ya estaba cargado sin enviar: el ítem de la cuenta y cómo estaba, para registrar sólo lo que cambió. */
  original?: { itemId: string; cantidad: number; nota: string | null };
}

/**
 * Un ítem sin enviar de la cuenta, de vuelta como renglón editable. El precio
 * es el que se cargó, no el de la carta de hoy; de la carta sólo se toma la foto.
 */
function lineaDeItem(item: Item, catalogo: Catalogo): LineaOrden {
  const enCarta = catalogo.productos.find((p) => p.id === item.productoId);
  return {
    clave: item.id,
    producto: {
      id: item.productoId,
      nombre: item.nombre,
      categoriaId: enCarta?.categoriaId ?? '',
      estacionId: item.estacionId,
      disponible: true,
      precioId: item.precioId,
      precioCentavos: item.precioCentavos,
      grupoIds: enCarta?.grupoIds ?? [],
      fotoVersion: enCarta?.fotoVersion ?? null,
    },
    cantidad: item.cantidad,
    modificadores: item.modificadores.map((m) => ({ id: m.modificadorId, nombre: m.nombre, precioCentavos: m.precioCentavos })),
    nota: item.nota,
    original: { itemId: item.id, cantidad: item.cantidad, nota: item.nota },
  };
}

const unitarioDe = (l: Pick<LineaOrden, 'producto' | 'modificadores'>) => l.producto.precioCentavos + l.modificadores.reduce((s, m) => s + m.precioCentavos, 0);

/** Sin modificadores ni nota, tocar el mismo plato otra vez suma uno al renglón que ya está. */
const sumable = (l: LineaOrden, producto: ProductoCatalogo) => l.producto.id === producto.id && !l.modificadores.length && !l.nota;

function TarjetaProducto({ producto, enOrden, alTocar }: { producto: ProductoCatalogo; enOrden: number; alTocar: () => void }) {
  return (
    <button
      type="button"
      onClick={alTocar}
      className={cn(
        'relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-elevada text-left transition-[border-color,transform] hover:border-acento active:scale-[0.98]',
        enOrden ? 'border-acento' : 'border-borde',
      )}
    >
      <FotoProducto producto={producto} className="aspect-[4/3] w-full" />
      <span className="flex flex-1 flex-col justify-between gap-1.5 p-2.5">
        <span className="line-clamp-2 text-sm font-medium leading-snug text-tinta">{producto.nombre}</span>
        <span className="flex items-center justify-between gap-2 text-xs">
          <span className="tabular-nums text-tinta-suave">{pesosDesdeCentavos(producto.precioCentavos)}</span>
          {producto.grupoIds.length ? <SlidersHorizontal size={12} strokeWidth={1.75} className="text-tinta-tenue" aria-label="Tiene opciones" /> : null}
        </span>
      </span>
      {enOrden ? (
        <span className="absolute right-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-acento px-1.5 text-xs font-semibold tabular-nums text-white shadow-sm">{enOrden}</span>
      ) : null}
    </button>
  );
}

function RenglonOrden({ linea, alCambiarCantidad, alCambiarNota }: { linea: LineaOrden; alCambiarCantidad: (cantidad: number) => void; alCambiarNota: (nota: string | null) => void }) {
  const [anotando, setAnotando] = useState(false);
  return (
    <li className="py-2">
      <div className="flex items-start gap-2.5">
        <FotoProducto producto={linea.producto} className="h-10 w-10 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-medium text-tinta">{linea.producto.nombre}</p>
            <span className="shrink-0 text-sm tabular-nums text-tinta">{pesosDesdeCentavos(unitarioDe(linea) * linea.cantidad)}</span>
          </div>
          {linea.modificadores.length ? <p className="text-xs text-tinta-tenue">{linea.modificadores.map((m) => m.nombre).join(' · ')}</p> : null}
          {anotando ? (
            <input
              className="campo mt-1.5 h-8 text-sm"
              autoFocus
              maxLength={140}
              defaultValue={linea.nota ?? ''}
              placeholder="Nota para cocina"
              aria-label="Nota para cocina"
              onBlur={(e) => {
                alCambiarNota(e.target.value.trim() || null);
                setAnotando(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                // Que Escape cierre la nota y no el modal entero.
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setAnotando(false);
                }
              }}
            />
          ) : linea.nota ? (
            <button type="button" onClick={() => setAnotando(true)} className="mt-1 cursor-pointer border-0 bg-transparent p-0 text-left text-xs italic text-alerta">
              «{linea.nota}»
            </button>
          ) : null}
          <div className="mt-1.5 flex items-center gap-1">
            <Boton type="button" variante="secundario" tamano="sm" soloIcono aria-label={linea.cantidad === 1 ? `Sacar ${linea.producto.nombre}` : 'Uno menos'} onClick={() => alCambiarCantidad(linea.cantidad - 1)}>
              <Minus size={13} strokeWidth={1.5} />
            </Boton>
            <span className="w-7 text-center text-sm font-medium tabular-nums text-tinta" aria-live="polite">
              {linea.cantidad}
            </span>
            <Boton type="button" variante="secundario" tamano="sm" soloIcono aria-label="Uno más" onClick={() => alCambiarCantidad(linea.cantidad + 1)}>
              <Plus size={13} strokeWidth={1.5} />
            </Boton>
            {!anotando && !linea.nota ? (
              <Boton type="button" variante="fantasma" tamano="sm" className="ml-auto" onClick={() => setAnotando(true)}>
                <MessageSquareText size={13} strokeWidth={1.5} /> Nota
              </Boton>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Armar una orden: se busca en la carta a la izquierda y a la derecha se va
 * juntando la orden con su total. Nada se registra hasta confirmar, así que
 * equivocarse acá no deja rastro en la cuenta. Funciona con la carta guardada
 * en el dispositivo.
 *
 * Abierta desde una orden sin enviar, trae esa orden para seguir armándola;
 * desde «Añadir orden», arranca una nueva, aunque haya otra sin enviar.
 */
export function AgregarItems({
  abierto,
  alCerrar,
  cuentaId,
  catalogo,
  operador,
  sinEnviar = [],
}: {
  abierto: boolean;
  alCerrar: () => void;
  cuentaId: string;
  catalogo: Catalogo;
  operador: Operador;
  /** La orden sin enviar que se está editando; vacío para una nueva. */
  sinEnviar?: Item[];
}) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [eligiendo, setEligiendo] = useState<ProductoCatalogo | null>(null);
  const [orden, setOrden] = useState<LineaOrden[]>(() => sinEnviar.map((i) => lineaDeItem(i, catalogo)));
  const [guardando, iniciar] = useTransition();
  const editando = sinEnviar.length > 0;
  // Lo que se sume queda en esta orden; una nueva estrena la suya.
  const [ordenId] = useState(() => sinEnviar.find((i) => i.ordenId)?.ordenId ?? crypto.randomUUID());

  const disponibles = useMemo(() => catalogo.productos.filter((p) => p.disponible), [catalogo.productos]);
  const texto = normalizar(busqueda);
  const encontrados = texto ? disponibles.filter((p) => normalizar(p.nombre).includes(texto)) : null;
  // Sin búsqueda, la carta va por categorías, en su orden; con una elegida, sólo esa.
  const secciones = catalogo.categorias
    .filter((c) => !categoriaId || c.id === categoriaId)
    .map((c) => ({ categoria: c, productos: disponibles.filter((p) => p.categoriaId === c.id) }))
    .filter((s) => s.productos.length);

  const gruposDe = (p: ProductoCatalogo) => p.grupoIds.map((id) => catalogo.grupos.find((g) => g.id === id)).filter((g): g is GrupoCatalogo => !!g);
  const enOrdenDe = (p: ProductoCatalogo) => orden.filter((l) => l.producto.id === p.id).reduce((s, l) => s + l.cantidad, 0);
  const total = orden.reduce((s, l) => s + unitarioDe(l) * l.cantidad, 0);
  const unidades = orden.reduce((s, l) => s + l.cantidad, 0);

  function tocar(producto: ProductoCatalogo) {
    if (gruposDe(producto).length) return setEligiendo(producto);
    const existente = orden.find((l) => sumable(l, producto));
    if (existente) return cambiarCantidad(existente.clave, existente.cantidad + 1);
    setOrden([...orden, { clave: crypto.randomUUID(), producto, cantidad: 1, modificadores: [], nota: null }]);
  }

  function cambiarCantidad(clave: string, cantidad: number) {
    setOrden(cantidad < 1 ? orden.filter((l) => l.clave !== clave) : orden.map((l) => (l.clave === clave ? { ...l, cantidad: Math.min(99, cantidad) } : l)));
  }

  function alTeclearBusqueda(e: KeyboardEvent<HTMLInputElement>) {
    // Enter suma el primero que aparece y deja la búsqueda lista para el siguiente.
    if (e.key === 'Enter' && encontrados?.[0]) {
      e.preventDefault();
      tocar(encontrados[0]);
      setBusqueda('');
    }
    if (e.key === 'Escape' && busqueda) {
      e.preventDefault();
      e.stopPropagation();
      setBusqueda('');
    }
  }

  function confirmar(enviar: boolean) {
    iniciar(async () => {
      // Si algo falla a mitad de camino, lo hecho ya está en la cuenta como orden
      // sin enviar: se cierra y al reabrirla se sigue desde ahí.
      const fallo = () => {
        toast.alerta('La orden quedó a medias', 'Abrila de nuevo desde la cuenta para seguir.');
        alCerrar();
      };
      const itemIds: string[] = [];
      for (const item of sinEnviar) {
        if (!orden.some((l) => l.original?.itemId === item.id) && !(await registrar('item_quitado', cuentaId, { itemId: item.id }))) return fallo();
      }
      for (const l of orden) {
        if (l.original && l.original.cantidad === l.cantidad && l.original.nota === l.nota) {
          itemIds.push(l.original.itemId);
          continue;
        }
        // Un borrador no se edita: se quita y se carga de nuevo como quedó.
        if (l.original && !(await registrar('item_quitado', cuentaId, { itemId: l.original.itemId }))) return fallo();
        const itemId = crypto.randomUUID();
        const ok = await registrar('item_agregado', cuentaId, {
          itemId,
          productoId: l.producto.id,
          precioId: l.producto.precioId,
          nombre: l.producto.nombre,
          precioCentavos: l.producto.precioCentavos,
          estacionId: l.producto.estacionId,
          cantidad: l.cantidad,
          modificadores: l.modificadores.map((m) => ({ modificadorId: m.id, nombre: m.nombre, precioCentavos: m.precioCentavos })),
          nota: l.nota,
          ordenId,
        });
        if (!ok) return fallo();
        itemIds.push(itemId);
      }
      if (enviar && itemIds.length && !(await registrar('items_enviados', cuentaId, { envioId: crypto.randomUUID(), itemIds }))) {
        toast.alerta('Orden cargada sin enviar', 'Mandala a cocina desde la cuenta.');
        return alCerrar();
      }
      if (enviar) toast.exito('Orden enviada a cocina');
      else if (itemIds.length) toast.exito(editando ? 'Orden guardada' : 'Orden cargada', 'Queda sin enviar en la cuenta.');
      else toast.exito('Orden descartada');
      alCerrar();
    });
  }

  const grilla = (productos: ProductoCatalogo[]) => (
    <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))]">
      {productos.map((p) => (
        <TarjetaProducto key={p.id} producto={p} enOrden={enOrdenDe(p)} alTocar={() => tocar(p)} />
      ))}
    </div>
  );

  return (
    <>
      {/* Queda abierto debajo mientras se eligen las opciones de un plato: los dos son
          `showModal`, el nuevo se apila encima, y Escape o el fondo cierran sólo el de arriba. */}
      <Modal abierto={abierto} alCerrar={alCerrar} titulo={editando ? 'Orden sin enviar' : 'Añadir orden'} ancho>
        {/* El `pt-1` le deja lugar al borde y al anillo de foco de la búsqueda: el `overflow-hidden` los recortaba arriba. */}
        <div className="modal-cuerpo grid gap-5 pt-1 md:h-[min(76vh,48rem)] md:grid-cols-[1fr_22rem] md:overflow-hidden md:pb-0">
          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <div className="relative">
              <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-tinta-tenue" />
              <input
                className="campo h-11 pl-10 text-base"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={alTeclearBusqueda}
                placeholder="Buscar en la carta"
                aria-label="Buscar en la carta"
                data-foco-inicial
              />
            </div>
            {!busqueda ? (
              <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1">
                {[{ id: null, nombre: 'Todo' }, ...catalogo.categorias].map((c) => (
                  <button
                    key={c.id ?? 'todo'}
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
            <div className="min-h-0 flex-1 md:-mr-2 md:overflow-y-auto md:pb-5 md:pr-2">
              {encontrados ? (
                encontrados.length ? (
                  <>
                    <p className="mb-2 text-xs text-tinta-tenue">Enter suma el primero</p>
                    {grilla(encontrados)}
                  </>
                ) : (
                  <EstadoVacio titulo="No hay nada con ese nombre" />
                )
              ) : secciones.length ? (
                <div className="flex flex-col gap-6">
                  {secciones.map(({ categoria, productos }) => (
                    <section key={categoria.id}>
                      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-tinta-tenue">{categoria.nombre}</h3>
                      {grilla(productos)}
                    </section>
                  ))}
                </div>
              ) : (
                <EstadoVacio titulo="No hay productos disponibles en esta categoría" />
              )}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col rounded-xl border border-borde bg-lienzo md:mb-5">
            <div className="flex items-center justify-between border-b border-borde px-3 py-2.5">
              <p className="text-sm font-medium text-tinta">
                Orden
                {unidades ? <span className="ml-1.5 text-xs font-normal tabular-nums text-tinta-tenue">{unidades === 1 ? '1 plato' : `${unidades} platos`}</span> : null}
              </p>
              {orden.length ? (
                <Boton type="button" variante="fantasma" tamano="sm" onClick={() => setOrden([])}>
                  <Trash2 size={13} strokeWidth={1.5} /> Vaciar
                </Boton>
              ) : null}
            </div>
            {orden.length === 0 ? (
              <div className="grid flex-1 place-items-center px-4 py-8 text-center">
                <p className="flex flex-col items-center gap-2 text-sm text-tinta-tenue">
                  <ShoppingBasket size={24} strokeWidth={1.5} /> Tocá un plato para sumarlo
                </p>
              </div>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto px-3">
                {orden.map((l) => (
                  <RenglonOrden
                    key={l.clave}
                    linea={l}
                    alCambiarCantidad={(cantidad) => cambiarCantidad(l.clave, cantidad)}
                    alCambiarNota={(nota) => setOrden(orden.map((x) => (x.clave === l.clave ? { ...x, nota } : x)))}
                  />
                ))}
              </ul>
            )}
            <div className="flex items-baseline justify-between border-t border-borde px-3 py-3">
              <span className="text-sm text-tinta-suave">Total de la orden</span>
              <span className="text-xl font-semibold tabular-nums text-tinta">{pesosDesdeCentavos(total)}</span>
            </div>
          </aside>
        </div>
        <footer className="modal-pie">
          {/* Editando, se puede guardar vacía: es descartar lo que estaba sin enviar. */}
          <Boton type="button" variante="secundario" onClick={() => confirmar(false)} disabled={(!orden.length && !editando) || guardando}>
            {editando ? 'Guardar sin enviar' : 'Cargar sin enviar'}
          </Boton>
          <Boton type="button" variante="primario" onClick={() => confirmar(true)} disabled={!orden.length} cargando={guardando}>
            <ChefHat size={15} strokeWidth={1.5} /> Enviar a cocina
          </Boton>
        </footer>
      </Modal>

      {eligiendo ? (
        <ModalItem
          key={eligiendo.id}
          producto={eligiendo}
          grupos={gruposDe(eligiendo)}
          alCerrar={(linea) => {
            if (linea) setOrden([...orden, linea]);
            setEligiendo(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Los modificadores, la cantidad y la nota de un plato que los pide. Devuelve el renglón, no registra nada. */
function ModalItem({ producto, grupos, alCerrar }: { producto: ProductoCatalogo; grupos: GrupoCatalogo[]; alCerrar: (linea: LineaOrden | null) => void }) {
  const toast = useToast();
  const [elegidos, setElegidos] = useState<Record<string, string[]>>({});
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState('');

  const faltan = grupos.filter((g) => g.obligatorio && !elegidos[g.id]?.length);
  const modificadores = grupos.flatMap((g) => g.modificadores.filter((m) => elegidos[g.id]?.includes(m.id)));

  function alternar(grupo: GrupoCatalogo, id: string) {
    const actuales = elegidos[grupo.id] ?? [];
    const siguientes = actuales.includes(id) ? actuales.filter((x) => x !== id) : grupo.multiple ? [...actuales, id] : [id];
    setElegidos({ ...elegidos, [grupo.id]: siguientes });
  }

  function sumar() {
    if (faltan.length) return toast.alerta(`Falta elegir: ${faltan.map((g) => g.nombre).join(', ')}`);
    alCerrar({ clave: crypto.randomUUID(), producto, cantidad, modificadores, nota: nota.trim() || null });
  }

  return (
    <Modal abierto alCerrar={() => alCerrar(null)} titulo={producto.nombre}>
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
        <Boton type="button" variante="secundario" onClick={() => alCerrar(null)}>
          Cancelar
        </Boton>
        <Boton type="button" variante="primario" onClick={sumar}>
          Sumar a la orden · {pesosDesdeCentavos((producto.precioCentavos + modificadores.reduce((s, m) => s + m.precioCentavos, 0)) * cantidad)}
        </Boton>
      </footer>
    </Modal>
  );
}
