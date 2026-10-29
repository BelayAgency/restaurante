'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { EstadoVacio, Tabla, Td, Th } from '@/components/ui';

type Resultado = { ok: true } | { ok: false; error: string };

/** Una lista de cosas que sólo tienen nombre: categorías, estaciones. */
export function ListaNombres({
  elementos,
  singular,
  vacio,
  alGuardar,
  alArchivar,
}: {
  elementos: { id: string; nombre: string; detalle?: string }[];
  singular: string;
  vacio: string;
  alGuardar: (id: string | null, nombre: string) => Promise<Resultado | { ok: true; datos: unknown }>;
  alArchivar: (id: string) => Promise<Resultado | { ok: true; datos: unknown }>;
}) {
  const toast = useToast();
  const [editando, setEditando] = useState<{ id: string | null; nombre: string } | null>(null);
  const [archivando, setArchivando] = useState<{ id: string; nombre: string } | null>(null);
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  function alMandar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    iniciar(async () => {
      const resultado = await alGuardar(editando.id, editando.nombre);
      if (!resultado.ok) return setError(resultado.error);
      setEditando(null);
      setError(undefined);
    });
  }

  function archivar() {
    if (!archivando) return;
    iniciar(async () => {
      const resultado = await alArchivar(archivando.id);
      if (!resultado.ok) toast.error(resultado.error);
      setArchivando(null);
    });
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Boton variante="secundario" onClick={() => setEditando({ id: null, nombre: '' })}>
          <Plus size={14} strokeWidth={1.5} /> Nueva {singular}
        </Boton>
      </div>
      {elementos.length === 0 ? (
        <EstadoVacio titulo={vacio} />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {elementos.map((e) => (
              <tr key={e.id}>
                <Td>
                  <span className="font-medium">{e.nombre}</span>
                  {e.detalle ? <span className="ml-2 text-xs text-tinta-tenue">{e.detalle}</span> : null}
                </Td>
                <Td className="text-right">
                  <div className="inline-flex gap-1">
                    <Boton variante="fantasma" tamano="sm" onClick={() => setEditando({ id: e.id, nombre: e.nombre })}>
                      Renombrar
                    </Boton>
                    <Boton variante="fantasma" tamano="sm" onClick={() => setArchivando(e)}>
                      Archivar
                    </Boton>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      <Modal abierto={editando !== null} alCerrar={() => setEditando(null)} titulo={editando?.id ? `Renombrar ${singular}` : `Nueva ${singular}`}>
        <form onSubmit={alMandar}>
          <div className="modal-cuerpo">
            <Campo
              etiqueta="Nombre"
              value={editando?.nombre ?? ''}
              onChange={(e) => editando && setEditando({ ...editando, nombre: e.target.value })}
              error={error}
              disabled={guardando}
              required
              data-foco-inicial
            />
          </div>
          <footer className="modal-pie">
            <Boton type="button" variante="secundario" onClick={() => setEditando(null)} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" cargando={guardando}>
              Guardar
            </Boton>
          </footer>
        </form>
      </Modal>

      <Modal abierto={archivando !== null} alCerrar={() => setArchivando(null)} titulo={`Archivar ${singular}`}>
        <div className="modal-cuerpo">
          <p className="text-sm text-tinta-suave">«{archivando?.nombre}» deja de aparecer. Lo ya cargado la sigue nombrando.</p>
        </div>
        <div className="modal-pie">
          <Boton variante="secundario" onClick={() => setArchivando(null)}>
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
