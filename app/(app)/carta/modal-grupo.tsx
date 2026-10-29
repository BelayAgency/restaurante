'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { CampoSwitch } from '@/components/switch';
import { useToast } from '@/components/toast';
import { centavosDesdeTexto, textoDesdeCentavos } from '@/lib/formato';
import type { Carta } from '@/servidor/carta';
import { accionArchivarGrupo, accionGuardarGrupo } from './acciones';

type Grupo = Carta['grupos'][number];

interface OpcionEditable {
  clave: string;
  id: string | null;
  nombre: string;
  precio: string;
}

/** Un grupo de modificadores ("Punto de cocción", "Guarnición") con sus opciones. */
export function ModalGrupo({ abierto, alCerrar, grupo }: { abierto: boolean; alCerrar: () => void; grupo: Grupo | null }) {
  const toast = useToast();
  const [nombre, setNombre] = useState(grupo?.nombre ?? '');
  const [obligatorio, setObligatorio] = useState(grupo?.obligatorio ?? false);
  const [multiple, setMultiple] = useState(grupo?.multiple ?? false);
  const [opciones, setOpciones] = useState<OpcionEditable[]>(
    grupo?.modificadores.map((m) => ({ clave: m.id, id: m.id, nombre: m.nombre, precio: textoDesdeCentavos(m.precioCentavos) })) ?? [
      { clave: crypto.randomUUID(), id: null, nombre: '', precio: '0' },
    ],
  );
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  const cambiar = (clave: string, cambios: Partial<OpcionEditable>) => setOpciones(opciones.map((o) => (o.clave === clave ? { ...o, ...cambios } : o)));

  function alMandar(e: FormEvent) {
    e.preventDefault();
    const convertidas = opciones.map((o) => ({ id: o.id, nombre: o.nombre, precioCentavos: centavosDesdeTexto(o.precio || '0') }));
    if (convertidas.some((o) => o.precioCentavos === null)) return setError('Revisá los precios');
    iniciar(async () => {
      const resultado = await accionGuardarGrupo({ id: grupo?.id ?? null, nombre, obligatorio, multiple, opciones: convertidas });
      if (!resultado.ok) return setError(resultado.error);
      toast.exito('Modificadores guardados');
      alCerrar();
    });
  }

  function archivar() {
    if (!grupo) return;
    iniciar(async () => {
      const resultado = await accionArchivarGrupo(grupo.id);
      if (!resultado.ok) return toast.error(resultado.error);
      toast.exito('Grupo archivado');
      alCerrar();
    });
  }

  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={grupo ? grupo.nombre : 'Nuevo grupo de modificadores'}>
      <form onSubmit={alMandar}>
        <div className="modal-cuerpo flex flex-col gap-4">
          <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={guardando} required data-foco-inicial />
          <CampoSwitch titulo="Obligatorio" descripcion="No se puede cargar el plato sin elegir." activo={obligatorio} alCambiar={setObligatorio} deshabilitado={guardando} />
          <CampoSwitch titulo="Se puede elegir más de una" activo={multiple} alCambiar={setMultiple} deshabilitado={guardando} />
          <div>
            <p className="etiqueta-campo">Opciones</p>
            <div className="flex flex-col gap-2">
              {opciones.map((o) => (
                <div key={o.clave} className="flex items-center gap-2">
                  <input
                    className="campo min-w-0 flex-1"
                    aria-label="Nombre de la opción"
                    value={o.nombre}
                    onChange={(e) => cambiar(o.clave, { nombre: e.target.value })}
                    disabled={guardando}
                    required
                  />
                  <NumeroInline etiqueta="Precio extra" valor={o.precio} alCambiar={(precio) => cambiar(o.clave, { precio })} decimales={2} className="w-28" />
                  <Boton
                    type="button"
                    variante="fantasma"
                    tamano="sm"
                    soloIcono
                    aria-label="Quitar opción"
                    onClick={() => setOpciones(opciones.filter((x) => x.clave !== o.clave))}
                    disabled={guardando || opciones.length === 1}
                  >
                    <X size={14} strokeWidth={1.5} />
                  </Boton>
                </div>
              ))}
            </div>
            <Boton
              type="button"
              variante="fantasma"
              tamano="sm"
              className="mt-2"
              onClick={() => setOpciones([...opciones, { clave: crypto.randomUUID(), id: null, nombre: '', precio: '0' }])}
              disabled={guardando}
            >
              <Plus size={14} strokeWidth={1.5} /> Agregar opción
            </Boton>
          </div>
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <footer className="modal-pie justify-between">
          {grupo ? (
            <Boton type="button" variante="peligro" onClick={archivar} disabled={guardando}>
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
  );
}
