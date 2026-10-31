'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import {
  Armchair,
  Bath,
  Circle,
  Copy,
  CookingPot,
  DoorOpen,
  Landmark,
  PanelTop,
  Plus,
  RectangleHorizontal,
  RotateCw,
  Square,
  Sprout,
  Trash2,
  Type,
  Undo2,
  Wine,
} from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { GRILLA } from '@/components/plano/constantes';
import { ETIQUETA_FIJA, type Margenes } from '@/components/plano/lienzo-plano';
import { LienzoPlanoDinamico } from '@/components/plano/lienzo-plano-dinamico';
import { Tabs } from '@/components/tabs';
import { useToast } from '@/components/toast';
import { EstadoVacio } from '@/components/ui';
import type { ElementoPlano, FormaElemento, SectorCatalogo, TipoElemento } from '@/dominio/catalogo';
import { usePantallaAncha } from '@/lib/pantalla-ancha';
import { sincronizar } from '@/local/sync';
import { accionArchivarSector, accionGuardarSector } from './acciones-plano';

/**
 * El modo edición del salón: el mismo mapa, con la paleta a un costado y las
 * propiedades del elemento elegido al otro. Nada se guarda hasta «Guardar»;
 * mientras tanto el salón sigue igual para el resto de los dispositivos.
 */

interface SectorEditable extends SectorCatalogo {
  nuevo: boolean;
}

interface Foto {
  sectores: SectorEditable[];
  elementos: ElementoPlano[];
}

const NOMBRE_TIPO: Record<TipoElemento, string> = {
  mesa: 'Mesa',
  pared: 'Pared',
  ventana: 'Ventana',
  puerta: 'Puerta',
  columna: 'Columna',
  barra: 'Barra',
  cocina: 'Cocina',
  bano: 'Baños',
  caja: 'Caja',
  planta: 'Planta',
  texto: 'Texto',
};

const MEDIDAS: Record<TipoElemento, { ancho: number; alto: number }> = {
  mesa: { ancho: 120, alto: 80 },
  pared: { ancho: 200, alto: 20 },
  ventana: { ancho: 160, alto: 20 },
  puerta: { ancho: 80, alto: 20 },
  columna: { ancho: 40, alto: 40 },
  barra: { ancho: 240, alto: 60 },
  cocina: { ancho: 200, alto: 120 },
  bano: { ancho: 120, alto: 100 },
  caja: { ancho: 100, alto: 60 },
  planta: { ancho: 40, alto: 40 },
  texto: { ancho: 200, alto: 40 },
};

const AGREGABLES: { tipo: TipoElemento; forma: FormaElemento; texto: string; icono: typeof Circle; capacidad?: number }[] = [
  { tipo: 'mesa', forma: 'rectangular', texto: 'Mesa de 4', icono: RectangleHorizontal, capacidad: 4 },
  { tipo: 'mesa', forma: 'redonda', texto: 'Mesa redonda', icono: Circle, capacidad: 2 },
  { tipo: 'mesa', forma: 'rectangular', texto: 'Mesa de 2', icono: Armchair, capacidad: 2 },
  { tipo: 'pared', forma: 'rectangular', texto: 'Pared', icono: Square },
  { tipo: 'ventana', forma: 'rectangular', texto: 'Ventana', icono: PanelTop },
  { tipo: 'puerta', forma: 'rectangular', texto: 'Puerta', icono: DoorOpen },
  { tipo: 'columna', forma: 'rectangular', texto: 'Columna', icono: Square },
  { tipo: 'barra', forma: 'rectangular', texto: 'Barra', icono: Wine },
  { tipo: 'cocina', forma: 'rectangular', texto: 'Cocina', icono: CookingPot },
  { tipo: 'caja', forma: 'rectangular', texto: 'Caja', icono: Landmark },
  { tipo: 'bano', forma: 'rectangular', texto: 'Baños', icono: Bath },
  { tipo: 'planta', forma: 'redonda', texto: 'Planta', icono: Sprout },
  { tipo: 'texto', forma: 'rectangular', texto: 'Texto', icono: Type },
];

const CON_ETIQUETA = new Set<TipoElemento>(['barra', 'cocina', 'bano', 'caja', 'texto']);
const CON_FORMA = new Set<TipoElemento>(['mesa', 'columna']);

/** 100 unidades del plano son un metro: una mesa de 120 × 80 es de 1,2 × 0,8 m. */
const metros = (unidades: number) => (unidades / 100).toLocaleString('es-AR', { maximumFractionDigits: 1 });

function esCampoDeTexto(destino: EventTarget | null) {
  return destino instanceof HTMLElement && (destino.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName) || !!destino.closest('dialog'));
}

/** Un campo en metros que se aplica al salir o con Enter: mientras se escribe, el plano no salta. */
function CampoMetros({ etiqueta, valor, min, max, alCambiar }: { etiqueta: string; valor: number; min: number; max: number; alCambiar: (unidades: number) => void }) {
  const [texto, setTexto] = useState(metros(valor));
  const [previo, setPrevio] = useState(valor);
  if (previo !== valor) {
    setPrevio(valor);
    setTexto(metros(valor));
  }
  function aplicar() {
    const numero = Number(texto.replace(',', '.'));
    if (!Number.isFinite(numero) || numero <= 0) return setTexto(metros(valor));
    const unidades = Math.min(max, Math.max(min, Math.round((numero * 100) / GRILLA) * GRILLA));
    alCambiar(unidades);
    setTexto(metros(unidades));
  }
  return (
    <Campo
      etiqueta={etiqueta}
      inputMode="decimal"
      value={texto}
      onChange={(e) => setTexto(e.target.value.replace(/[^\d,.]/g, ''))}
      onBlur={aplicar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') aplicar();
      }}
    />
  );
}

export function EditorPlano({
  inicial,
  sectorInicial,
  mesasConCuenta,
  alSalir,
}: {
  inicial: { sectores: SectorCatalogo[]; elementos: ElementoPlano[] };
  sectorInicial: string | null;
  /** Las mesas con una cuenta abierta no se pueden quitar: la cuenta quedaría sin lugar. */
  mesasConCuenta: Set<string>;
  /** Vuelve a la operación mostrando el sector que se estaba editando. */
  alSalir: (sectorId: string | null) => void;
}) {
  const toast = useToast();
  const ancha = usePantallaAncha();
  const [foto, setFoto] = useState<Foto>(() => ({ sectores: inicial.sectores.map((s) => ({ ...s, nuevo: false })), elementos: inicial.elementos }));
  const [pasado, setPasado] = useState<Foto[]>([]);
  const [sectorId, setSectorId] = useState<string | null>(sectorInicial ?? inicial.sectores[0]?.id ?? null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [sinGuardar, setSinGuardar] = useState<Set<string>>(new Set());
  const [creandoSector, setCreandoSector] = useState(inicial.sectores.length === 0);
  const [nombreSector, setNombreSector] = useState('');
  const [archivando, setArchivando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [guardando, iniciar] = useTransition();

  const { sectores, elementos } = foto;
  const sector = sectores.find((s) => s.id === sectorId) ?? null;
  const delSector = elementos.filter((e) => e.sectorId === sectorId);
  const elegido = delSector.find((e) => e.id === seleccionado) ?? null;
  const conCuenta = elegido ? mesasConCuenta.has(elegido.id) : false;

  /** Todo cambio pasa por acá: guarda la foto anterior para deshacer y marca el sector. */
  function cambiarFoto(cambio: (f: Foto) => Foto, sectorTocado = sectorId) {
    setPasado((p) => [...p.slice(-49), foto]);
    setFoto(cambio(foto));
    if (sectorTocado) setSinGuardar((previo) => new Set(previo).add(sectorTocado));
  }

  function deshacer() {
    const anterior = pasado.at(-1);
    if (!anterior) return;
    setPasado(pasado.slice(0, -1));
    setFoto(anterior);
    if (!anterior.elementos.some((e) => e.id === seleccionado)) setSeleccionado(null);
    if (!anterior.sectores.some((s) => s.id === sectorId)) setSectorId(anterior.sectores[0]?.id ?? null);
  }

  function cambiar(id: string, cambios: Partial<ElementoPlano>) {
    cambiarFoto((f) => ({ ...f, elementos: f.elementos.map((e) => (e.id === id ? { ...e, ...cambios } : e)) }));
  }

  function cambiarSector(cambios: Partial<SectorCatalogo>) {
    if (!sector) return;
    cambiarFoto((f) => ({ ...f, sectores: f.sectores.map((s) => (s.id === sector.id ? { ...s, ...cambios } : s)) }));
  }

  /** Un lugar libre cerca del centro, para que lo nuevo no caiga encima de otra cosa. */
  function lugarLibre(s: SectorCatalogo) {
    let x = Math.round(s.ancho / 2 / GRILLA) * GRILLA;
    let y = Math.round(s.alto / 2 / GRILLA) * GRILLA;
    while (delSector.some((e) => e.x === x && e.y === y)) {
      x += GRILLA * 2;
      y += GRILLA * 2;
    }
    return { x, y };
  }

  function proximoNumero() {
    return Math.max(0, ...elementos.map((e) => e.numeroMesa ?? 0)) + 1;
  }

  function agregar(a: (typeof AGREGABLES)[number]) {
    if (!sector) return;
    const medidas = a.tipo === 'mesa' && a.forma === 'redonda' ? { ancho: 80, alto: 80 } : a.tipo === 'mesa' && a.capacidad === 2 ? { ancho: 80, alto: 80 } : MEDIDAS[a.tipo];
    const nuevo: ElementoPlano = {
      id: crypto.randomUUID(),
      sectorId: sector.id,
      tipo: a.tipo,
      forma: a.forma,
      ...lugarLibre(sector),
      ...medidas,
      rotacion: 0,
      numeroMesa: a.tipo === 'mesa' ? proximoNumero() : null,
      capacidad: a.tipo === 'mesa' ? (a.capacidad ?? 4) : null,
      etiqueta: a.tipo === 'texto' ? sector.nombre : null,
    };
    cambiarFoto((f) => ({ ...f, elementos: [...f.elementos, nuevo] }));
    setSeleccionado(nuevo.id);
  }

  function duplicar() {
    if (!elegido || !sector) return;
    const copia: ElementoPlano = {
      ...elegido,
      id: crypto.randomUUID(),
      x: Math.min(sector.ancho, elegido.x + GRILLA * 2),
      y: Math.min(sector.alto, elegido.y + GRILLA * 2),
      numeroMesa: elegido.tipo === 'mesa' ? proximoNumero() : null,
    };
    cambiarFoto((f) => ({ ...f, elementos: [...f.elementos, copia] }));
    setSeleccionado(copia.id);
  }

  function quitar() {
    if (!elegido || conCuenta) return;
    cambiarFoto((f) => ({ ...f, elementos: f.elementos.filter((e) => e.id !== elegido.id) }));
    setSeleccionado(null);
  }

  function girar() {
    if (elegido) cambiar(elegido.id, { rotacion: (elegido.rotacion + 90) % 360 });
  }

  function cambiarForma(forma: FormaElemento) {
    if (!elegido) return;
    const lado = Math.max(elegido.ancho, elegido.alto);
    cambiar(elegido.id, forma === 'redonda' ? { forma, ancho: lado, alto: lado } : { forma, ancho: lado, alto: Math.max(GRILLA * 2, Math.round((lado * 2) / 3 / GRILLA) * GRILLA) });
  }

  // Teclado: borrar, duplicar, mover de a un cuadro, deshacer y soltar la selección.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (esCampoDeTexto(e.target)) return;
      const modificador = e.ctrlKey || e.metaKey;
      if (modificador && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        deshacer();
      } else if (modificador && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicar();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        quitar();
      } else if (e.key === 'Escape') {
        setSeleccionado(null);
      } else if (elegido && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const paso = e.shiftKey ? GRILLA * 5 : GRILLA;
        const dx = e.key === 'ArrowLeft' ? -paso : e.key === 'ArrowRight' ? paso : 0;
        const dy = e.key === 'ArrowUp' ? -paso : e.key === 'ArrowDown' ? paso : 0;
        cambiar(elegido.id, { x: elegido.x + dx, y: elegido.y + dy });
      }
    }
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  });

  function crearSector(e: FormEvent) {
    e.preventDefault();
    const nuevo: SectorEditable = { id: crypto.randomUUID(), nombre: nombreSector.trim(), orden: sectores.length, ancho: 1200, alto: 800, nuevo: true };
    cambiarFoto((f) => ({ ...f, sectores: [...f.sectores, nuevo] }), nuevo.id);
    setSectorId(nuevo.id);
    setSeleccionado(null);
    setCreandoSector(false);
    setNombreSector('');
  }

  function guardar() {
    const numeros = elementos.filter((e) => e.tipo === 'mesa').map((e) => e.numeroMesa);
    const repetido = numeros.find((n, i) => n !== null && numeros.indexOf(n) !== i);
    if (numeros.includes(null)) return toast.error('Hay una mesa sin número');
    if (repetido) return toast.error(`Hay dos mesas con el número ${repetido}`);

    iniciar(async () => {
      for (const s of sectores.filter((x) => sinGuardar.has(x.id))) {
        const resultado = await accionGuardarSector({
          id: s.id,
          nuevo: s.nuevo,
          nombre: s.nombre,
          orden: s.orden,
          ancho: s.ancho,
          alto: s.alto,
          elementos: elementos
            .filter((e) => e.sectorId === s.id)
            .map((e) => ({
              id: e.id,
              tipo: e.tipo,
              forma: e.forma,
              x: e.x,
              y: e.y,
              ancho: e.ancho,
              alto: e.alto,
              rotacion: e.rotacion,
              numeroMesa: e.numeroMesa,
              capacidad: e.capacidad,
              etiqueta: e.etiqueta?.trim() || null,
            })),
        });
        if (!resultado.ok) {
          setSectorId(s.id);
          return toast.error(resultado.error);
        }
        setFoto((f) => ({ ...f, sectores: f.sectores.map((x) => (x.id === s.id ? { ...x, nuevo: false } : x)) }));
        setSinGuardar((previo) => {
          const resto = new Set(previo);
          resto.delete(s.id);
          return resto;
        });
      }
      // El salón se dibuja con el catálogo del dispositivo: se trae ya, sin esperar el ciclo.
      await sincronizar();
      toast.exito('Plano guardado', 'Los demás dispositivos lo toman en la próxima sincronización.');
      alSalir(sectorId);
    });
  }

  function salir() {
    if (sinGuardar.size > 0) setDescartando(true);
    else alSalir(sectorId);
  }

  function archivar() {
    if (!sector) return;
    if (delSector.some((e) => mesasConCuenta.has(e.id))) {
      setArchivando(false);
      return toast.error('Este sector tiene mesas con cuentas abiertas');
    }
    iniciar(async () => {
      if (!sector.nuevo) {
        const resultado = await accionArchivarSector(sector.id);
        if (!resultado.ok) return toast.error(resultado.error);
      }
      const resto = sectores.filter((s) => s.id !== sector.id);
      setFoto((f) => ({ sectores: resto, elementos: f.elementos.filter((e) => e.sectorId !== sector.id) }));
      setPasado([]);
      setSinGuardar((previo) => {
        const quedan = new Set(previo);
        quedan.delete(sector.id);
        return quedan;
      });
      setSectorId(resto[0]?.id ?? null);
      setArchivando(false);
      await sincronizar();
    });
  }

  const margenes: Margenes = ancha ? { arriba: 80, abajo: 24, izquierda: 188, derecha: 300 } : { arriba: 120, abajo: 96, izquierda: 16, derecha: 16 };

  return (
    <>
      {sector ? (
        <div className="absolute inset-0">
          <LienzoPlanoDinamico
            sector={sector}
            elementos={delSector}
            modo="edicion"
            seleccionado={seleccionado}
            alSeleccionar={setSeleccionado}
            alCambiarElemento={cambiar}
            margenes={margenes}
            claseControles="bottom-24 right-3 xl:bottom-4 xl:right-[19rem]"
          />
        </div>
      ) : (
        <div className="grid h-full place-items-center p-6">
          <EstadoVacio titulo="Todavía no hay sectores" detalle="Salón, terraza, barra: cada uno es un plano aparte." />
        </div>
      )}

      {/* Arriba: sectores y las acciones de la edición. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
        <div className="panel-flotante pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto p-1.5">
          <span className="whitespace-nowrap px-1.5 text-sm font-medium text-tinta">Editando el plano</span>
          {sectores.length > 0 ? (
            <div className="shrink-0">
  <Tabs
                etiqueta="Sectores"
                valor={sectorId ?? ''}
                alCambiar={(id) => {
                  setSectorId(id);
                  setSeleccionado(null);
                }}
                opciones={sectores.map((s) => ({ valor: s.id, etiqueta: sinGuardar.has(s.id) ? `${s.nombre} •` : s.nombre }))}
              />
            </div>
          ) : null}
          <Boton variante="fantasma" tamano="sm" onClick={() => setCreandoSector(true)}>
            <Plus size={14} strokeWidth={1.75} /> Sector
          </Boton>
        </div>
        <div className="panel-flotante pointer-events-auto flex items-center gap-1.5 p-1.5">
          <Boton variante="fantasma" tamano="sm" soloIcono aria-label="Deshacer" title="Deshacer (Ctrl+Z)" onClick={deshacer} disabled={!pasado.length || guardando}>
            <Undo2 size={15} strokeWidth={1.75} />
          </Boton>
          <Boton variante="secundario" tamano="sm" onClick={salir} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton variante="primario" tamano="sm" onClick={guardar} cargando={guardando} disabled={sinGuardar.size === 0}>
            Guardar
          </Boton>
        </div>
      </div>

      {/* La paleta: a la izquierda en pantalla ancha, abajo en el celular. */}
      {sector ? (
        <div className="panel-flotante absolute inset-x-3 bottom-3 flex gap-1 overflow-x-auto p-1.5 xl:inset-x-auto xl:bottom-auto xl:left-3 xl:top-20 xl:max-h-[calc(100%-6rem)] xl:w-44 xl:flex-col xl:overflow-y-auto">
          <p className="hidden px-2 pb-1 pt-1 text-xs font-medium text-tinta-tenue xl:block">Agregar</p>
          {AGREGABLES.map((a) => (
            <button
              key={a.texto}
              type="button"
              onClick={() => agregar(a)}
              className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-sm text-tinta hover:bg-fill-fantasma-hover"
            >
              <a.icono size={15} strokeWidth={1.5} className="text-tinta-suave" /> {a.texto}
            </button>
          ))}
        </div>
      ) : null}

      {/* Propiedades: del elemento elegido o, sin nada elegido, del sector. */}
      {sector && (elegido || ancha) ? (
        <div className="panel-flotante absolute inset-x-3 bottom-[4.75rem] max-h-[45%] overflow-y-auto p-4 xl:inset-x-auto xl:bottom-auto xl:right-3 xl:top-20 xl:max-h-[calc(100%-6rem)] xl:w-72">
          {elegido ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-tinta">{elegido.tipo === 'mesa' ? `Mesa ${elegido.numeroMesa ?? ''}` : NOMBRE_TIPO[elegido.tipo]}</p>
                <span className="text-xs tabular-nums text-tinta-tenue">
                  {metros(elegido.ancho)} × {metros(elegido.alto)} m
                </span>
              </div>
              {elegido.tipo === 'mesa' ? (
                <div className="grid grid-cols-2 gap-3">
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
                    onChange={(e) => cambiar(elegido.id, { capacidad: Math.min(99, Number(e.target.value.replace(/\D/g, ''))) || null })}
                  />
                </div>
              ) : null}
              {CON_ETIQUETA.has(elegido.tipo) ? (
                <Campo
                  etiqueta={elegido.tipo === 'texto' ? 'Texto' : 'Nombre en el plano'}
                  placeholder={elegido.tipo === 'texto' ? 'Terraza' : ETIQUETA_FIJA[elegido.tipo as Exclude<TipoElemento, 'mesa'>]}
                  maxLength={40}
                  value={elegido.etiqueta ?? ''}
                  onChange={(e) => cambiar(elegido.id, { etiqueta: e.target.value })}
                />
              ) : null}
              {CON_FORMA.has(elegido.tipo) ? (
                <Tabs
                  etiqueta="Forma"
                  ancho
                  valor={elegido.forma}
                  alCambiar={(f) => cambiarForma(f as FormaElemento)}
                  opciones={[
                    { valor: 'rectangular', etiqueta: 'Rectangular' },
                    { valor: 'redonda', etiqueta: 'Redonda' },
                  ]}
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Boton variante="secundario" tamano="sm" onClick={girar}>
                  <RotateCw size={13} strokeWidth={1.5} /> Girar
                </Boton>
                <Boton variante="secundario" tamano="sm" onClick={duplicar} title="Duplicar (Ctrl+D)">
                  <Copy size={13} strokeWidth={1.5} /> Duplicar
                </Boton>
                <Boton variante="peligro" tamano="sm" onClick={quitar} disabled={conCuenta} title="Quitar (Supr)">
                  <Trash2 size={13} strokeWidth={1.5} /> Quitar
                </Boton>
              </div>
              {conCuenta ? <p className="text-xs text-tinta-tenue">Tiene una cuenta abierta: se puede mover, pero no quitar.</p> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-tinta">Sector</p>
              <Campo etiqueta="Nombre" maxLength={40} value={sector.nombre} onChange={(e) => cambiarSector({ nombre: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <CampoMetros etiqueta="Ancho (m)" valor={sector.ancho} min={400} max={5000} alCambiar={(ancho) => cambiarSector({ ancho })} />
                <CampoMetros etiqueta="Largo (m)" valor={sector.alto} min={300} max={5000} alCambiar={(alto) => cambiarSector({ alto })} />
              </div>
              <p className="text-xs leading-relaxed text-tinta-tenue">
                Arrastrá para mover y usá las manijas para girar o cambiar el tamaño. Con el teclado: flechas para mover, Supr para quitar, Ctrl+D para duplicar.
              </p>
              <Boton variante="fantasma" tamano="sm" className="self-start" onClick={() => setArchivando(true)}>
                Archivar sector
              </Boton>
            </div>
          )}
        </div>
      ) : null}

      <Modal abierto={creandoSector} alCerrar={() => setCreandoSector(false)} titulo="Nuevo sector" descripcion="Salón, terraza, barra: cada uno es un plano aparte.">
        <form onSubmit={crearSector}>
          <div className="modal-cuerpo">
            <Campo etiqueta="Nombre" value={nombreSector} onChange={(e) => setNombreSector(e.target.value)} required maxLength={40} data-foco-inicial />
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

      <Modal abierto={descartando} alCerrar={() => setDescartando(false)} titulo="Descartar los cambios">
        <div className="modal-cuerpo">
          <p className="text-sm text-tinta-suave">Hay cambios sin guardar en el plano. Si salís, se pierden.</p>
        </div>
        <div className="modal-pie">
          <Boton variante="secundario" onClick={() => setDescartando(false)}>
            Seguir editando
          </Boton>
          <Boton variante="peligro" onClick={() => alSalir(sectorId)}>
            Descartar
          </Boton>
        </div>
      </Modal>
    </>
  );
}
