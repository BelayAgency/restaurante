'use client';

import { useState, useTransition } from 'react';
import { Plus, Search } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CampoBuscar } from '@/components/campo-buscar';
import { FiltroSelector } from '@/components/filtro-selector';
import { Switch } from '@/components/switch';
import { PanelTab, Tabs } from '@/components/tabs';
import { useToast } from '@/components/toast';
import { EstadoVacio, Insignia, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import { pesosDesdeCentavos } from '@/lib/formato';
import type { Carta } from '@/servidor/carta';
import { accionArchivarCategoria, accionArchivarEstacion, accionDisponibilidad, accionGuardarCategoria, accionGuardarEstacion } from './acciones';
import { ListaNombres } from './lista-nombres';
import { ModalGrupo } from './modal-grupo';
import { ModalProducto } from './modal-producto';

type Producto = Carta['productos'][number];
type Grupo = Carta['grupos'][number];

export function AdministrarCarta({ carta, busqueda, categoriaFiltro }: { carta: Carta; busqueda: string; categoriaFiltro?: string }) {
  const toast = useToast();
  const [tab, setTab] = useState('productos');
  // `undefined`: cerrado; `null`: uno nuevo.
  const [producto, setProducto] = useState<Producto | null>();
  const [grupo, setGrupo] = useState<Grupo | null>();
  const [, iniciar] = useTransition();

  const nombreCategoria = new Map(carta.categorias.map((c) => [c.id, c.nombre]));
  const nombreEstacion = new Map(carta.estaciones.map((e) => [e.id, e.nombre]));
  const filtrando = busqueda !== '' || categoriaFiltro !== undefined;

  return (
    <>
      <TituloSeccion
        accion={
          tab === 'productos' ? (
            <Boton variante="primario" onClick={() => setProducto(null)} disabled={!carta.categorias.length || !carta.estaciones.length}>
              <Plus size={15} strokeWidth={1.75} /> Nuevo producto
            </Boton>
          ) : tab === 'modificadores' ? (
            <Boton variante="primario" onClick={() => setGrupo(null)}>
              <Plus size={15} strokeWidth={1.75} /> Nuevo grupo
            </Boton>
          ) : null
        }
      >
        Carta
      </TituloSeccion>

      <Tarjeta>
        <Tabs
          etiqueta="Secciones de la carta"
          valor={tab}
          alCambiar={setTab}
          opciones={[
            { valor: 'productos', etiqueta: 'Productos' },
            { valor: 'categorias', etiqueta: 'Categorías' },
            { valor: 'estaciones', etiqueta: 'Estaciones' },
            { valor: 'modificadores', etiqueta: 'Modificadores' },
          ]}
        />

        <PanelTab valor="productos" activo={tab}>
          <div className="my-4 flex flex-wrap gap-2">
            <CampoBuscar accion="/carta" valor={busqueda} placeholder="Buscar producto" parametrosOcultos={{ categoria: categoriaFiltro }} />
            <FiltroSelector
              parametro="categoria"
              opciones={[{ valor: 'todos', etiqueta: 'Todas las categorías' }, ...carta.categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
            />
          </div>
          {carta.productos.length === 0 ? (
            <EstadoVacio
              icono={filtrando ? <Search size={24} strokeWidth={1.5} /> : undefined}
              titulo={filtrando ? 'No hay productos con ese filtro' : 'Todavía no hay productos'}
              detalle={
                !carta.categorias.length || !carta.estaciones.length
                  ? 'Primero creá al menos una categoría y una estación de cocina.'
                  : undefined
              }
            />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Categoría</Th>
                  <Th>Estación</Th>
                  <Th className="text-right">Precio</Th>
                  <Th>Disponible</Th>
                </tr>
              </thead>
              <tbody>
                {carta.productos.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <button type="button" onClick={() => setProducto(p)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-tinta hover:text-acento">
                        {p.nombre}
                      </button>
                    </Td>
                    <Td className="text-tinta-suave">{nombreCategoria.get(p.categoriaId)}</Td>
                    <Td className="text-tinta-suave">{nombreEstacion.get(p.estacionId)}</Td>
                    <Td className="text-right tabular-nums">{pesosDesdeCentavos(p.precioCentavos)}</Td>
                    <Td>
                      <Switch
                        etiqueta={`${p.nombre} disponible`}
                        activo={p.disponible}
                        alCambiar={(disponible) =>
                          iniciar(async () => {
                            const resultado = await accionDisponibilidad(p.id, disponible);
                            if (!resultado.ok) toast.error(resultado.error);
                          })
                        }
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </PanelTab>

        <PanelTab valor="categorias" activo={tab}>
          <div className="mt-4">
            <ListaNombres
              elementos={carta.categorias}
              singular="categoría"
              vacio="Todavía no hay categorías"
              alGuardar={accionGuardarCategoria}
              alArchivar={accionArchivarCategoria}
            />
          </div>
        </PanelTab>

        <PanelTab valor="estaciones" activo={tab}>
          <div className="mt-4">
            <ListaNombres
              elementos={carta.estaciones}
              singular="estación"
              vacio="Todavía no hay estaciones: cocina, parrilla, barra…"
              alGuardar={accionGuardarEstacion}
              alArchivar={accionArchivarEstacion}
            />
          </div>
        </PanelTab>

        <PanelTab valor="modificadores" activo={tab}>
          <div className="mt-4">
            {carta.grupos.length === 0 ? (
              <EstadoVacio titulo="Todavía no hay modificadores" detalle="Punto de cocción, guarnición, sin sal: se agrupan y se asignan a cada plato." />
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <Th>Grupo</Th>
                    <Th>Opciones</Th>
                    <Th>Reglas</Th>
                  </tr>
                </thead>
                <tbody>
                  {carta.grupos.map((g) => (
                    <tr key={g.id}>
                      <Td>
                        <button type="button" onClick={() => setGrupo(g)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-tinta hover:text-acento">
                          {g.nombre}
                        </button>
                      </Td>
                      <Td className="text-tinta-suave">
                        {g.modificadores.map((m) => (m.precioCentavos ? `${m.nombre} (+${pesosDesdeCentavos(m.precioCentavos)})` : m.nombre)).join(', ')}
                      </Td>
                      <Td>
                        <div className="flex gap-1">
                          {g.obligatorio ? <Insignia tono="acento">Obligatorio</Insignia> : null}
                          {g.multiple ? <Insignia tono="neutro">Varias</Insignia> : null}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </div>
        </PanelTab>
      </Tarjeta>

      {producto !== undefined ? (
        <ModalProducto key={producto?.id ?? 'nuevo'} abierto alCerrar={() => setProducto(undefined)} producto={producto} carta={carta} />
      ) : null}
      {grupo !== undefined ? <ModalGrupo key={grupo?.id ?? 'nuevo'} abierto alCerrar={() => setGrupo(undefined)} grupo={grupo} /> : null}
    </>
  );
}
