'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Circle, DoorOpen, Plus, RectangleHorizontal, Save, Square, Trash2 } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { GRILLA } from '@/components/plano/constantes';
import { LienzoPlanoDinamico } from '@/components/plano/lienzo-plano-dinamico';
import { Tabs } from '@/components/tabs';
import { useToast } from '@/components/toast';
import { Aviso, EstadoVacio, Tarjeta, TituloSeccion } from '@/components/ui';
import type { ElementoPlano, FormaElemento, SectorCatalogo, TipoElemento } from '@/dominio/catalogo';
import { accionArchivarSector, accionGuardarSector } from './acciones';

interface SectorEditable extends SectorCatalogo {
  nuevo: boolean;
}

const MEDIDAS: Record<TipoElemento, { ancho: number; alto: number }> = {
  mesa: { ancho: 120, alto: 80 },
  pared: { ancho: 200, alto: 20 },
  barra: { ancho: 240, alto: 60 },
  columna: { ancho: 40, alto: 40 },
  puerta: { ancho: 80, alto: 20 },
  cocina: { ancho: 200, alto: 120 },
};

const AGREGABLES: { tipo: TipoElemento; forma: FormaElemento; texto: string; icono: typeof Circle }[] = [
  { tipo: 'mesa', forma: 'redonda', texto: 'Mesa redonda', icono: Circle },
  { tipo: 'mesa', forma: 'rectangular', texto: 'Mesa', icono: RectangleHorizontal },
  { tipo: 'pared', forma: 'rectangular', texto: 'Pared', icono: Square },
  { tipo: 'barra', forma: 'rectangular', texto: 'Barra', icono: Square },
  { tipo: 'columna', forma: 'rectangular', texto: 'Columna', icono: Square },
  { tipo: 'puerta', forma: 'rectangular', texto: 'Puerta', icono: DoorOpen },
  { tipo: 'cocina', forma: 'rectangular', texto: 'Cocina', icono: Square },
];

export function EditorPlano({ inicial }: { inicial: { sectores: SectorCatalogo[]; elementos: ElementoPlano[] } }) {
  const toast = useToast();
  const [sectores, setSectores] = useState<SectorEditable[]>(inicial.sectores.map((s) => ({ ...s, nuevo: false })));
  const [elementos, setElementos] = useState<ElementoPlano[]>(inicial.elementos);
  const [sectorId, setSectorId] = useState<string | null>(inicial.sectores[0]?.id ?? null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [sinGuardar, setSinGuardar] = useState<Set<string>>(new Set());
  const [creandoSector, setCreandoSector] = useState(false);
  const [nombreSector, setNombreSector] = useState('');
  const [archivando, setArchivando] = useState(false);
  const [guardando, iniciar] = useTransition();

  const sector = sectores.find((s) => s.id === sectorId) ?? null;
  const delSector = elementos.filter((e) => e.sectorId === sectorId);
  const elegido = delSector.find((e) => e.id === seleccionado) ?? null;

  function tocar(id: string) {
    setSinGuardar((previo) => new Set(previo).add(id));
  }

  function cambiar(id: string, cambios: Partial<ElementoPlano>) {
    setElementos((lista) => lista.map((e) => (e.id === id ? { ...e, ...cambios } : e)));
    if (sectorId) tocar(sectorId);
  }

  function agregar(tipo: TipoElemento, forma: FormaElemento) {
    if (!sector) return;
    const medidas = forma === 'redonda' ? { ancho: 80, alto: 80 } : MEDIDAS[tipo];
    const proximoNumero = Math.max(0, ...elementos.map((e) => e.numeroMesa ?? 0)) + 1;
    const nuevo: ElementoPlano = {
      id: crypto.randomUUID(),
      sectorId: sector.id,
      tipo,
      forma,
      x: Math.round(sector.ancho / 2 / GRILLA) * GRILLA,
      y: Math.round(sector.alto / 2 / GRILLA) * GRILLA,
      ...medidas,
      rotacion: 0,
      numeroMesa: tipo === 'mesa' ? proximoNumero : null,
      capacidad: tipo === 'mesa' ? (forma === 'redonda' ? 2 : 4) : null,
    };
    setElementos((lista) => [...lista, nuevo]);
    setSeleccionado(nuevo.id);
    tocar(sector.id);
  }

  function quitar() {
    if (!elegido) return;
    setElementos((lista) => lista.filter((e) => e.id !== elegido.id));
    setSeleccionado(null);
    if (sectorId) tocar(sectorId);
  }

  function crearSector(e: FormEvent) {
    e.preventDefault();
    const nuevo: SectorEditable = { id: crypto.randomUUID(), nombre: nombreSector.trim(), orden: sectores.length, ancho: 1200, alto: 800, nuevo: true };
    setSectores([...sectores, nuevo]);
    setSectorId(nuevo.id);
    tocar(nuevo.id);
    setCreandoSector(false);
    setNombreSector('');
  }

  function guardar() {
    if (!sector) return;
    iniciar(async () => {
      const resultado = await accionGuardarSector({
        id: sector.id,
        nuevo: sector.nuevo,
        nombre: sector.nombre,
        orden: sector.orden,
        ancho: sector.ancho,
        alto: sector.alto,
        elementos: delSector.map((e) => ({ id: e.id, tipo: e.tipo, forma: e.forma, x: e.x, y: e.y, ancho: e.ancho, alto: e.alto, rotacion: e.rotacion, numeroMesa: e.numeroMesa, capacidad: e.capacidad })),
      });
      if (!resultado.ok) return toast.error(resultado.error);
      setSectores((lista) => lista.map((s) => (s.id === sector.id ? { ...s, nuevo: false } : s)));
      setSinGuardar((previo) => {
        const resto = new Set(previo);
        resto.delete(sector.id);
        return resto;
      });
      toast.exito('Plano guardado', 'Los dispositivos lo toman en la próxima sincronización.');
    });
  }

  function archivar() {
    if (!sector) return;
    iniciar(async () => {
      if (!sector.nuevo) {
        const resultado = await accionArchivarSector(sector.id);
        if (!resultado.ok) return toast.error(resultado.error);
      }
      const resto = sectores.filter((s) => s.id !== sector.id);
      setSectores(resto);
      setElementos((lista) => lista.filter((e) => e.sectorId !== sector.id));
      setSectorId(resto[0]?.id ?? null);
      setArchivando(false);
    });
  }

  return (
    <>
      <TituloSeccion
        descripcion="Arrastrá para mover, usá las manijas para girar y cambiar el tamaño. Todo se acomoda a la grilla."
        accion={
          <Boton variante="primario" onClick={guardar} cargando={guardando} disabled={!sector || !sinGuardar.has(sector.id)}>
            <Save size={15} strokeWidth={1.75} /> Guardar sector
          </Boton>
        }
      >
        Plano del salón
      </TituloSeccion>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {sectores.length > 0 ? (
          <Tabs
            etiqueta="Sectores"
            valor={sectorId ?? ''}
            alCambiar={(id) => {
              setSectorId(id);
              setSeleccionado(null);
            }}
            opciones={sectores.map((s) => ({ valor: s.id, etiqueta: sinGuardar.has(s.id) ? `${s.nombre} •` : s.nombre }))}
          />
        ) : null}
        <Boton variante="secundario" tamano="sm" onClick={() => setCreandoSector(true)}>
          <Plus size={14} strokeWidth={1.5} /> Sector
        </Boton>
      </div>

      {!sector ? (
        <Tarjeta>
          <EstadoVacio titulo="Todavía no hay sectores" detalle="Salón, terraza, barra: cada uno es un plano aparte." />
        </Tarjeta>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <Tarjeta padding={false} className="overflow-hidden p-2">
            <LienzoPlanoDinamico
              sector={sector}
              elementos={delSector}
              modo="edicion"
              seleccionado={seleccionado}
              alSeleccionar={setSeleccionado}
              alCambiarElemento={cambiar}
            />
          </Tarjeta>

          <div className="flex flex-col gap-4">
            <Tarjeta>
              <p className="mb-2 text-sm font-medium text-tinta">Agregar</p>
              <div className="grid grid-cols-2 gap-2">
                {AGREGABLES.map((a) => (
                  <Boton key={a.texto} variante="secundario" tamano="sm" onClick={() => agregar(a.tipo, a.forma)}>
                    <a.icono size={13} strokeWidth={1.5} /> {a.texto}
                  </Boton>
                ))}
              </div>
            </Tarjeta>

            {elegido ? (
              <Tarjeta>
                <p className="mb-3 text-sm font-medium text-tinta">{elegido.tipo === 'mesa' ? `Mesa ${elegido.numeroMesa ?? ''}` : 'Elemento'}</p>
                {elegido.tipo === 'mesa' ? (
                  <div className="flex flex-col gap-3">
                    <Campo
                      etiqueta="Número"
                      inputMode="numeric"
                      value={elegido.numeroMesa ?? ''}
                      onChange={(e) => cambiar(elegido.id, { numeroMesa: Number(e.target.value.replace(/\D/g, '')) || null })}
                    />
                    <Campo
                      etiqueta="Lugares"
                      inputMode="numeric"
                      value={elegido.capacidad ?? ''}
                      onChange={(e) => cambiar(elegido.id, { capacidad: Number(e.target.value.replace(/\D/g, '')) || null })}
                    />
                  </div>
                ) : null}
                <Boton variante="peligro" tamano="sm" className="mt-3" onClick={quitar}>
                  <Trash2 size={13} strokeWidth={1.5} /> Quitar
                </Boton>
              </Tarjeta>
            ) : null}

            <Tarjeta>
              <Campo
                etiqueta="Nombre del sector"
                value={sector.nombre}
                onChange={(e) => {
                  setSectores(sectores.map((s) => (s.id === sector.id ? { ...s, nombre: e.target.value } : s)));
                  tocar(sector.id);
                }}
              />
              <Boton variante="fantasma" tamano="sm" className="mt-3" onClick={() => setArchivando(true)}>
                Archivar sector
              </Boton>
            </Tarjeta>

            {sinGuardar.size > 0 ? <Aviso tono="alerta">Hay cambios sin guardar. Cada sector se guarda por separado.</Aviso> : null}
          </div>
        </div>
      )}

      <Modal abierto={creandoSector} alCerrar={() => setCreandoSector(false)} titulo="Nuevo sector">
        <form onSubmit={crearSector}>
          <div className="modal-cuerpo">
            <Campo etiqueta="Nombre" value={nombreSector} onChange={(e) => setNombreSector(e.target.value)} required data-foco-inicial />
          </div>
          <footer className="modal-pie">
            <Boton type="button" variante="secundario" onClick={() => setCreandoSector(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario">
              Crear
            </Boton>
          </footer>
        </form>
      </Modal>

      <Modal abierto={archivando} alCerrar={() => setArchivando(false)} titulo="Archivar sector">
        <div className="modal-cuerpo">
          <p className="text-sm text-tinta-suave">«{sector?.nombre}» y sus mesas dejan de aparecer en el salón. Las cuentas que ya tuvieron quedan.</p>
        </div>
        <div className="modal-pie">
          <Boton variante="secundario" onClick={() => setArchivando(false)}>
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
