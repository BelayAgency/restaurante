'use client';

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { CampoFoto } from '@/components/campo-foto';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { Selector } from '@/components/selector';
import { Switch } from '@/components/switch';
import { Tabs } from '@/components/tabs';
import { useToast } from '@/components/toast';
import { urlFotoInsumo, urlFotoProducto } from '@/dominio/catalogo';
import { factorDeConversion, formatearCantidad, NOMBRE_UNIDAD, type UnidadBase } from '@/dominio/stock';
import { cn } from '@/lib/cn';
import { centavosDesdeTexto, numeroDesdeTexto, pesosDesdeCentavos, textoDesdeCentavos, textoDesdeNumero } from '@/lib/formato';
import type { Productos } from '@/servidor/productos';
import {
  accionArchivarProductoConReceta,
  accionArchivarProductoConStock,
  accionGuardarProductoConReceta,
  accionGuardarProductoConStock,
  accionQuitarFotoInsumo,
  accionQuitarFotoProducto,
  accionSubirFotoInsumo,
  accionSubirFotoProducto,
} from './acciones';

export type ConStock = Productos['conStock'][number];
export type ConReceta = Productos['conReceta'][number];
/** Qué se abre: uno con stock, uno con receta, o `null` para cargar uno nuevo. */
export type ProductoAbierto = { tipo: 'stock'; producto: ConStock } | { tipo: 'receta'; producto: ConReceta } | null;

const MEDIDAS: { valor: UnidadBase; etiqueta: string }[] = [
  { valor: 'u', etiqueta: 'Unidad' },
  { valor: 'ml', etiqueta: 'Mililitros (ml)' },
  { valor: 'g', etiqueta: 'Gramos (g)' },
  { valor: 'parte', etiqueta: 'Partes' },
];

interface LineaEditable {
  clave: string;
  insumoId: string | null;
  cantidad: string;
}

/**
 * Un producto: con stock (se compra, se cuenta y puede venderse tal cual) o
 * con receta (se vende y descuenta de los que tienen stock). El tipo se elige
 * al crearlo; después se ajusta todo lo demás.
 */
export function ModalProducto({ abierto, productos, alCerrar }: { abierto: ProductoAbierto; productos: Productos; alCerrar: () => void }) {
  const toast = useToast();
  const stock = abierto?.tipo === 'stock' ? abierto.producto : null;
  const receta = abierto?.tipo === 'receta' ? abierto.producto : null;
  const venta = stock?.venta ?? receta ?? null;

  const [tipo, setTipo] = useState<'stock' | 'receta'>(abierto?.tipo ?? 'stock');
  const [nombre, setNombre] = useState(stock?.nombre ?? receta?.nombre ?? '');
  const [unidad, setUnidad] = useState<UnidadBase | null>(stock?.unidad ?? null);
  const [contenido, setContenido] = useState(stock?.contenidoPorUnidad ? textoDesdeNumero(stock.contenidoPorUnidad) : '');
  const [minimo, setMinimo] = useState(stock ? textoDesdeNumero(stock.stockMinimo) : '');
  const [presentaciones, setPresentaciones] = useState(
    stock?.presentaciones.map((p) => ({ clave: p.id, id: p.id as string | null, nombre: p.nombre, cantidad: textoDesdeNumero(p.cantidadBase) })) ?? [],
  );
  const [lineas, setLineas] = useState<LineaEditable[]>(
    receta?.lineas.map((l) => ({ clave: crypto.randomUUID(), insumoId: l.insumoId, cantidad: textoDesdeNumero(l.cantidad) })) ?? [{ clave: crypto.randomUUID(), insumoId: null, cantidad: '' }],
  );
  const [vendible, setVendible] = useState(venta?.vendible ?? false);
  const [precio, setPrecio] = useState(venta?.vendible && venta.precioCentavos ? textoDesdeCentavos(venta.precioCentavos) : '');
  const [categoriaId, setCategoriaId] = useState<string | null>(venta?.categoriaId ?? null);
  const [estacionId, setEstacionId] = useState<string | null>(venta?.estacionId ?? null);
  const [confirmandoArchivo, setConfirmandoArchivo] = useState(false);
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  // Medido por unidad cada una es 1: no hay nada que declarar. Vacío es mercadería suelta (la carne, por peso).
  const conContenido = unidad !== null && unidad !== 'u';
  const contenidoPorUnidad = conContenido && contenido ? numeroDesdeTexto(contenido) : null;
  const cambiaMedida = stock !== null && unidad !== null && unidad !== stock.unidad;
  const factor = cambiaMedida ? factorDeConversion(stock, { unidad, contenidoPorUnidad }) : null;
  const conStock = productos.conStock.filter((p) => p.tipo === 'compra');
  const insumo = (id: string | null) => productos.conStock.find((p) => p.id === id);
  const costoReceta = lineas.reduce((s, l) => s + (numeroDesdeTexto(l.cantidad || '0') ?? 0) * (insumo(l.insumoId)?.costoUnitario ?? 0), 0);

  function guardar() {
    const datosVenta = { vendible, precioCentavos: vendible ? (centavosDesdeTexto(precio || '0') ?? 0) : 0, categoriaId, estacionId };
    if (vendible && (!datosVenta.precioCentavos || !categoriaId || !estacionId)) return setError('Para venderlo poné el precio, la categoría y la estación');
    iniciar(async () => {
      let resultado;
      if (tipo === 'stock') {
        if (!unidad) return setError('Elegí la composición');
        resultado = await accionGuardarProductoConStock({
          insumo: {
            id: stock?.id ?? null,
            nombre,
            tipo: stock?.tipo ?? 'compra',
            unidad,
            contenidoPorUnidad,
            stockMinimo: numeroDesdeTexto(minimo || '0') ?? 0,
            presentaciones: presentaciones.map((p) => ({ id: p.id, nombre: p.nombre, cantidadBase: numeroDesdeTexto(p.cantidad || '0') ?? 0 })),
          },
          venta: datosVenta,
        });
      } else {
        const elegidas = lineas.filter((l) => l.insumoId);
        if (elegidas.some((l) => !(numeroDesdeTexto(l.cantidad || '0') ?? 0))) return setError('Cada producto de la receta necesita su cantidad');
        resultado = await accionGuardarProductoConReceta({
          id: receta?.id ?? null,
          nombre,
          venta: datosVenta,
          lineas: elegidas.map((l) => ({ insumoId: l.insumoId!, cantidad: numeroDesdeTexto(l.cantidad) ?? 0 })),
        });
      }
      if (!resultado.ok) return setError(resultado.error);
      toast.exito('Producto guardado');
      alCerrar();
    });
  }

  function archivar() {
    iniciar(async () => {
      const resultado = stock ? await accionArchivarProductoConStock(stock.id) : receta ? await accionArchivarProductoConReceta(receta.id) : null;
      if (!resultado) return;
      if (!resultado.ok) {
        setConfirmandoArchivo(false);
        return toast.error(resultado.error);
      }
      toast.exito('Producto archivado');
      alCerrar();
    });
  }

  const conError = async (resultado: { ok: boolean; error?: string }) => {
    if (!resultado.ok) toast.error(resultado.error ?? 'No se pudo guardar la foto');
    return resultado.ok;
  };
  // La foto necesita el producto ya creado: en el alta aparece al volver a abrirlo.
  const foto = stock ? (
    <CampoFoto
      url={stock.fotoVersion ? urlFotoInsumo(stock.id, stock.fotoVersion) : null}
      alSubir={async (base64) => conError(await accionSubirFotoInsumo(stock.id, base64))}
      alQuitar={async () => conError(await accionQuitarFotoInsumo(stock.id))}
    />
  ) : receta ? (
    <CampoFoto
      url={receta.fotoVersion ? urlFotoProducto(receta.id, receta.fotoVersion) : null}
      alSubir={async (base64) => conError(await accionSubirFotoProducto(receta.id, base64))}
      alQuitar={async () => conError(await accionQuitarFotoProducto(receta.id))}
    />
  ) : null;

  const campoNombre = <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required data-foco-inicial />;
  // Mientras se convierte la medida, el mínimo y las presentaciones los pasa el servidor.
  const campoMinimo =
    tipo === 'stock' ? (
      <CampoNumero etiqueta={`Stock mínimo${unidad ? ` (${NOMBRE_UNIDAD[unidad]})` : ''}`} valor={minimo} alCambiar={setMinimo} decimales={3} placeholder="0" disabled={Boolean(factor)} />
    ) : null;

  return (
    <>
      <Modal abierto alCerrar={alCerrar} titulo={abierto ? nombre || 'Producto' : 'Nuevo producto'}>
        <div className="modal-cuerpo flex flex-col gap-4">
          {abierto ? null : (
            <Tabs
              etiqueta="Tipo de producto"
              valor={tipo}
              alCambiar={(v) => setTipo(v as 'stock' | 'receta')}
              opciones={[
                { valor: 'stock', etiqueta: 'Con stock' },
                { valor: 'receta', etiqueta: 'Con receta' },
              ]}
              ancho
            />
          )}

          {foto ? (
            // La foto al costado de lo que se edita: debajo, sola, dejaba un renglón entero vacío a su derecha.
            <div className="flex flex-col gap-4 sm:flex-row">
              {foto}
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                {campoNombre}
                {campoMinimo}
              </div>
            </div>
          ) : (
            <div className={cn('grid gap-4', campoMinimo && 'sm:grid-cols-2')}>
              {campoNombre}
              {campoMinimo}
            </div>
          )}

          {tipo === 'stock' ? (
            <>
              <div className={cn('grid gap-4', conContenido && 'sm:grid-cols-2')}>
                <div>
                  <label className="etiqueta-campo">Composición</label>
                  <Selector opciones={MEDIDAS} valor={unidad} alElegir={(v) => setUnidad(v as UnidadBase)} />
                </div>
                {conContenido ? (
                  <CampoNumero
                    etiqueta={unidad === 'parte' ? 'Partes por unidad' : `Cada unidad trae (${NOMBRE_UNIDAD[unidad]})`}
                    valor={contenido}
                    alCambiar={setContenido}
                    decimales={3}
                    placeholder="0"
                  />
                ) : null}
              </div>
              {stock && cambiaMedida ? (
                <p className="rounded-xl bg-lienzo px-4 py-3 text-sm text-tinta-suave">
                  {factor
                    ? `Al guardar, el stock pasa de ${formatearCantidad(stock.total, stock.unidad)} a ${formatearCantidad(stock.total * factor, unidad!)}, y el mínimo, las presentaciones y las recetas se convierten igual. Después se ajusta cualquier cosa a mano.`
                    : 'Sin saber cuánto trae cada unidad no hay cuenta para convertir: cambia sólo la medida, y el stock y las recetas quedan con los números de antes.'}
                </p>
              ) : null}
              {!factor ? (
                <div>
                  <p className="etiqueta-campo">Cómo se compra</p>
                  <div className="flex flex-col gap-2">
                    {presentaciones.map((p) => (
                      <div key={p.clave} className="flex items-center gap-2">
                        <input
                          className="campo min-w-0 flex-1"
                          aria-label="Presentación"
                          placeholder="Presentación"
                          value={p.nombre}
                          onChange={(e) => setPresentaciones(presentaciones.map((x) => (x.clave === p.clave ? { ...x, nombre: e.target.value } : x)))}
                        />
                        <NumeroInline
                          etiqueta={`Equivale a (${unidad ? NOMBRE_UNIDAD[unidad] : 'unidad'})`}
                          valor={p.cantidad}
                          alCambiar={(cantidad) => setPresentaciones(presentaciones.map((x) => (x.clave === p.clave ? { ...x, cantidad } : x)))}
                          decimales={3}
                          className="w-28"
                        />
                        <span className="w-10 text-xs text-tinta-tenue">{unidad ? NOMBRE_UNIDAD[unidad] : ''}</span>
                        <Boton variante="fantasma" tamano="sm" soloIcono aria-label="Quitar presentación" onClick={() => setPresentaciones(presentaciones.filter((x) => x.clave !== p.clave))}>
                          <X size={14} strokeWidth={1.5} />
                        </Boton>
                      </div>
                    ))}
                  </div>
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    className="mt-2"
                    onClick={() => setPresentaciones([...presentaciones, { clave: crypto.randomUUID(), id: null, nombre: '', cantidad: '' }])}
                  >
                    <Plus size={14} strokeWidth={1.5} /> Presentación
                  </Boton>
                </div>
              ) : null}
            </>
          ) : (
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="etiqueta-campo">Lleva</p>
                {costoReceta > 0 ? <p className="text-xs tabular-nums text-tinta-tenue">Costo {pesosDesdeCentavos(Math.round(costoReceta))}</p> : null}
              </div>
              <div className="flex flex-col gap-2">
                {lineas.map((l) => {
                  const elegido = insumo(l.insumoId);
                  return (
                    <div key={l.clave} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <Selector
                          opciones={conStock.map((p) => ({ valor: p.id, etiqueta: p.nombre, detalle: NOMBRE_UNIDAD[p.unidad] }))}
                          valor={l.insumoId}
                          alElegir={(insumoId) => setLineas(lineas.map((x) => (x.clave === l.clave ? { ...x, insumoId } : x)))}
                          buscador
                        />
                      </div>
                      <NumeroInline
                        etiqueta={`Cantidad${elegido ? ` (${NOMBRE_UNIDAD[elegido.unidad]})` : ''}`}
                        valor={l.cantidad}
                        alCambiar={(cantidad) => setLineas(lineas.map((x) => (x.clave === l.clave ? { ...x, cantidad } : x)))}
                        decimales={3}
                        className="w-28"
                      />
                      <span className="w-10 text-xs text-tinta-tenue">{elegido ? NOMBRE_UNIDAD[elegido.unidad] : ''}</span>
                      <Boton variante="fantasma" tamano="sm" soloIcono aria-label="Quitar de la receta" onClick={() => setLineas(lineas.filter((x) => x.clave !== l.clave))} disabled={lineas.length === 1}>
                        <X size={14} strokeWidth={1.5} />
                      </Boton>
                    </div>
                  );
                })}
              </div>
              <Boton variante="fantasma" tamano="sm" className="mt-2" onClick={() => setLineas([...lineas, { clave: crypto.randomUUID(), insumoId: null, cantidad: '' }])}>
                <Plus size={14} strokeWidth={1.5} /> Producto
              </Boton>
            </div>
          )}

          <div className="rounded-xl bg-lienzo p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="producto-vendible" className="text-sm font-medium text-tinta">
                Vendible
              </label>
              <Switch id="producto-vendible" activo={vendible} alCambiar={setVendible} etiqueta="Vendible" />
            </div>
            {vendible ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <CampoNumero etiqueta="Precio" valor={precio} alCambiar={setPrecio} decimales={2} prefijo="$" placeholder="0" />
                <div>
                  <label className="etiqueta-campo">Categoría</label>
                  <Selector opciones={productos.categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} valor={categoriaId} alElegir={setCategoriaId} />
                </div>
                <div>
                  <label className="etiqueta-campo">Estación</label>
                  <Selector opciones={productos.estaciones.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} valor={estacionId} alElegir={setEstacionId} />
                </div>
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <footer className="modal-pie justify-between">
          {abierto ? (
            <Boton variante="peligro" onClick={() => setConfirmandoArchivo(true)} disabled={guardando}>
              Archivar
            </Boton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton variante="primario" onClick={guardar} cargando={guardando}>
              Guardar
            </Boton>
          </div>
        </footer>
      </Modal>
      <Modal abierto={confirmandoArchivo} alCerrar={() => setConfirmandoArchivo(false)} titulo="Archivar producto">
        <div className="modal-cuerpo">
          <p className="text-sm text-tinta-suave">{stock ? 'Deja de aparecer en el stock y en la carta. Sus movimientos quedan.' : 'Deja de aparecer en la carta. Lo vendido queda.'}</p>
        </div>
        <div className="modal-pie">
          <Boton variante="secundario" onClick={() => setConfirmandoArchivo(false)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={archivar} cargando={guardando}>
            Archivar
          </Boton>
        </div>
      </Modal>
    </>
  );
}
