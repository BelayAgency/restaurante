'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { CampoSwitch } from '@/components/switch';
import { useToast } from '@/components/toast';
import { centavosDesdeTexto, textoDesdeCentavos } from '@/lib/formato';
import type { Carta } from '@/servidor/carta';
import { accionArchivarProducto, accionGuardarProducto } from './acciones';

type Producto = Carta['productos'][number];

export function ModalProducto({
  abierto,
  alCerrar,
  producto,
  carta,
}: {
  abierto: boolean;
  alCerrar: () => void;
  /** `null` para uno nuevo. */
  producto: Producto | null;
  carta: Carta;
}) {
  const toast = useToast();
  const [nombre, setNombre] = useState(producto?.nombre ?? '');
  const [categoriaId, setCategoriaId] = useState<string | null>(producto?.categoriaId ?? null);
  const [estacionId, setEstacionId] = useState<string | null>(producto?.estacionId ?? null);
  const [precio, setPrecio] = useState(producto ? textoDesdeCentavos(producto.precioCentavos) : '');
  const [disponible, setDisponible] = useState(producto?.disponible ?? true);
  const [grupoIds, setGrupoIds] = useState<string[]>(producto?.grupoIds ?? []);
  const [error, setError] = useState<string>();
  const [confirmandoArchivo, setConfirmandoArchivo] = useState(false);
  const [guardando, iniciar] = useTransition();

  function alMandar(e: FormEvent) {
    e.preventDefault();
    const precioCentavos = centavosDesdeTexto(precio);
    if (precioCentavos === null) return setError('Poné el precio');
    iniciar(async () => {
      const resultado = await accionGuardarProducto({ id: producto?.id ?? null, nombre, categoriaId, estacionId, precioCentavos, disponible, grupoIds });
      if (!resultado.ok) return setError(resultado.error);
      toast.exito(producto ? 'Producto guardado' : 'Producto creado', producto && producto.precioCentavos !== precioCentavos ? 'El precio anterior queda en el historial.' : undefined);
      alCerrar();
    });
  }

  function archivar() {
    if (!producto) return;
    iniciar(async () => {
      const resultado = await accionArchivarProducto(producto.id);
      if (!resultado.ok) return toast.error(resultado.error);
      toast.exito('Producto archivado');
      setConfirmandoArchivo(false);
      alCerrar();
    });
  }

  return (
    <>
      <Modal abierto={abierto} alCerrar={alCerrar} titulo={producto ? producto.nombre : 'Nuevo producto'}>
        <form onSubmit={alMandar}>
          <div className="modal-cuerpo flex flex-col gap-4">
            <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={guardando} required data-foco-inicial />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="etiqueta-campo">Categoría</label>
                <Selector
                  opciones={carta.categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
                  valor={categoriaId}
                  alElegir={setCategoriaId}
                  vacio="Creá una categoría primero"
                  deshabilitado={guardando}
                />
              </div>
              <div>
                <label className="etiqueta-campo">Se prepara en</label>
                <Selector
                  opciones={carta.estaciones.map((e) => ({ valor: e.id, etiqueta: e.nombre }))}
                  valor={estacionId}
                  alElegir={setEstacionId}
                  vacio="Creá una estación primero"
                  deshabilitado={guardando}
                />
              </div>
            </div>
            <CampoNumero
              etiqueta="Precio"
              valor={precio}
              alCambiar={setPrecio}
              decimales={2}
              prefijo="$"
              placeholder="0"
              disabled={guardando}
              ayuda={producto ? 'Cambiarlo no toca lo ya cobrado: el anterior queda archivado.' : undefined}
            />
            {carta.grupos.length > 0 ? (
              <fieldset>
                <legend className="etiqueta-campo">Modificadores</legend>
                <div className="flex flex-col gap-2">
                  {carta.grupos.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm text-tinta">
                      <input
                        type="checkbox"
                        checked={grupoIds.includes(g.id)}
                        onChange={(e) => setGrupoIds(e.target.checked ? [...grupoIds, g.id] : grupoIds.filter((x) => x !== g.id))}
                        disabled={guardando}
                        className="accent-[var(--color-acento)]"
                      />
                      {g.nombre}
                      <span className="text-xs text-tinta-tenue">{g.modificadores.map((m) => m.nombre).join(', ')}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <CampoSwitch titulo="Disponible" descripcion="Si se agotó, no aparece para cargar." activo={disponible} alCambiar={setDisponible} deshabilitado={guardando} />
            {error ? <p className="text-sm text-error">{error}</p> : null}
          </div>
          <footer className="modal-pie justify-between">
            {producto ? (
              <Boton type="button" variante="peligro" onClick={() => setConfirmandoArchivo(true)} disabled={guardando}>
                Archivar
              </Boton>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Boton type="button" variante="secundario" onClick={alCerrar} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton type="submit" variante="primario" cargando={guardando}>
                Guardar
              </Boton>
            </div>
          </footer>
        </form>
      </Modal>
      <Modal abierto={confirmandoArchivo} alCerrar={() => setConfirmandoArchivo(false)} titulo="Archivar producto">
        <div className="modal-cuerpo">
          <p className="text-sm text-tinta-suave">Deja de aparecer en la carta. Lo ya vendido y su historial de precios quedan.</p>
        </div>
        <div className="modal-pie">
          <Boton variante="secundario" onClick={() => setConfirmandoArchivo(false)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" cargando={guardando} onClick={archivar}>
            Archivar
          </Boton>
        </div>
      </Modal>
    </>
  );
}
