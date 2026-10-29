'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Circle, Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type { ElementoPlano, SectorCatalogo, TipoElemento } from '@/dominio/catalogo';
import { useColoresTema, type ColoresTema, type TokenColor } from './colores-tema';
import { GRILLA } from './constantes';

/**
 * El plano del local en canvas. Lo comparten el editor (el dueño arma el
 * salón) y la operación (todos ven las mesas y las abren con el dedo). Las
 * coordenadas de cada elemento son su centro, así rotar no lo corre de lugar.
 */

const ESCALA_MIN = 0.3;
const ESCALA_MAX = 3;

export type TonoMesa = 'libre' | 'ocupada' | 'demorada' | 'pidio_cuenta' | 'precuenta' | 'conflicto';

export interface MarcaMesa {
  tono: TonoMesa;
  /** Una o dos líneas cortas debajo del número: tiempo, total. */
  lineas: string[];
}

const TONO: Record<TonoMesa, { relleno: TokenColor; borde: TokenColor }> = {
  libre: { relleno: 'superficie', borde: 'borde-fuerte' },
  ocupada: { relleno: 'acento-tenue', borde: 'acento' },
  demorada: { relleno: 'error-tenue', borde: 'error' },
  pidio_cuenta: { relleno: 'alerta-tenue', borde: 'alerta' },
  precuenta: { relleno: 'exito-tenue', borde: 'exito' },
  conflicto: { relleno: 'error-tenue', borde: 'error' },
};

const FIJO: Record<Exclude<TipoElemento, 'mesa'>, { relleno: TokenColor; etiqueta: string }> = {
  pared: { relleno: 'tinta-suave', etiqueta: '' },
  barra: { relleno: 'borde-fuerte', etiqueta: 'Barra' },
  columna: { relleno: 'tinta-tenue', etiqueta: '' },
  puerta: { relleno: 'acento-tenue', etiqueta: 'Puerta' },
  cocina: { relleno: 'alerta-tenue', etiqueta: 'Cocina' },
};

function ajustar(valor: number) {
  return Math.round(valor / GRILLA) * GRILLA;
}

function Elemento({
  elemento,
  colores,
  modo,
  marca,
  seleccionado,
  alSeleccionar,
  alMover,
  alTocarMesa,
}: {
  elemento: ElementoPlano;
  colores: ColoresTema;
  modo: 'edicion' | 'operacion';
  marca?: MarcaMesa;
  seleccionado: boolean;
  alSeleccionar: () => void;
  alMover: (x: number, y: number) => void;
  alTocarMesa?: () => void;
}) {
  const { ancho, alto } = elemento;
  const esMesa = elemento.tipo === 'mesa';
  const tono = TONO[marca?.tono ?? 'libre'];
  const relleno = esMesa ? colores[tono.relleno] : colores[FIJO[elemento.tipo as Exclude<TipoElemento, 'mesa'>].relleno];
  const borde = esMesa ? colores[tono.borde] : 'transparent';
  const tocar = esMesa && modo === 'operacion' ? alTocarMesa : modo === 'edicion' ? alSeleccionar : undefined;
  const lineas = marca?.lineas ?? (esMesa && modo === 'edicion' && elemento.capacidad ? [`${elemento.capacidad} lugares`] : []);

  return (
    <Group
      id={elemento.id}
      x={elemento.x}
      y={elemento.y}
      rotation={elemento.rotacion}
      draggable={modo === 'edicion'}
      onDragStart={alSeleccionar}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        const x = ajustar(e.target.x());
        const y = ajustar(e.target.y());
        e.target.position({ x, y });
        alMover(x, y);
      }}
      onClick={tocar}
      onTap={tocar}
    >
      {esMesa && elemento.forma === 'redonda' ? (
        <Circle radius={Math.min(ancho, alto) / 2} fill={relleno} stroke={seleccionado ? colores.acento : borde} strokeWidth={seleccionado ? 3 : 2} />
      ) : (
        <Rect
          x={-ancho / 2}
          y={-alto / 2}
          width={ancho}
          height={alto}
          cornerRadius={esMesa ? 10 : 2}
          fill={relleno}
          stroke={seleccionado ? colores.acento : borde}
          strokeWidth={seleccionado ? 3 : esMesa ? 2 : 0}
        />
      )}
      {esMesa ? (
        // El texto contrarrota: el número se lee derecho aunque la mesa esté girada.
        <Group rotation={-elemento.rotacion} listening={false}>
          <Text
            text={String(elemento.numeroMesa ?? '')}
            fontSize={20}
            fontStyle="600"
            fill={colores.tinta}
            width={120}
            x={-60}
            y={lineas.length ? -18 : -10}
            align="center"
          />
          {lineas.map((linea, i) => (
            <Text key={i} text={linea} fontSize={11} fill={colores['tinta-suave']} width={120} x={-60} y={6 + i * 13} align="center" />
          ))}
        </Group>
      ) : FIJO[elemento.tipo as Exclude<TipoElemento, 'mesa'>].etiqueta ? (
        <Text
          text={FIJO[elemento.tipo as Exclude<TipoElemento, 'mesa'>].etiqueta}
          fontSize={12}
          fill={colores['tinta-suave']}
          width={ancho}
          x={-ancho / 2}
          y={-6}
          align="center"
          listening={false}
        />
      ) : null}
    </Group>
  );
}

export function LienzoPlano({
  sector,
  elementos,
  modo,
  seleccionado = null,
  alSeleccionar,
  alCambiarElemento,
  marcaDeMesa,
  alTocarMesa,
  alto = 520,
}: {
  sector: SectorCatalogo;
  elementos: ElementoPlano[];
  modo: 'edicion' | 'operacion';
  seleccionado?: string | null;
  alSeleccionar?: (id: string | null) => void;
  alCambiarElemento?: (id: string, cambios: Partial<ElementoPlano>) => void;
  marcaDeMesa?: (mesaId: string) => MarcaMesa | undefined;
  alTocarMesa?: (mesaId: string) => void;
  alto?: number;
}) {
  const colores = useColoresTema();
  const caja = useRef<HTMLDivElement>(null);
  const escenario = useRef<Konva.Stage>(null);
  const transformador = useRef<Konva.Transformer>(null);
  const [ancho, setAncho] = useState(0);
  const [vista, setVista] = useState<{ escala: number; x: number; y: number } | null>(null);
  const pellizco = useRef<{ distancia: number; escala: number } | null>(null);

  useEffect(() => {
    const nodo = caja.current;
    if (!nodo) return;
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.floor(entrada!.contentRect.width)));
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  // Al cambiar de sector o de tamaño de pantalla, el plano entra entero.
  const vistaInicial = useMemo(() => {
    if (!ancho) return null;
    const escala = Math.min(ancho / sector.ancho, alto / sector.alto, 1.5);
    return { escala, x: (ancho - sector.ancho * escala) / 2, y: (alto - sector.alto * escala) / 2 };
  }, [ancho, alto, sector.ancho, sector.alto]);
  const [claveVista, setClaveVista] = useState('');
  const claveActual = `${sector.id}:${ancho}:${alto}`;
  if (vistaInicial && claveVista !== claveActual) {
    setClaveVista(claveActual);
    setVista(vistaInicial);
  }

  useEffect(() => {
    const tr = transformador.current;
    const st = escenario.current;
    if (!tr || !st) return;
    const nodo = seleccionado ? st.findOne(`#${seleccionado}`) : undefined;
    tr.nodes(nodo ? [nodo] : []);
    tr.getLayer()?.batchDraw();
  }, [seleccionado, elementos]);

  function zoomEn(punto: { x: number; y: number }, nuevaEscala: number) {
    if (!vista) return;
    const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, nuevaEscala));
    const enPlano = { x: (punto.x - vista.x) / vista.escala, y: (punto.y - vista.y) / vista.escala };
    setVista({ escala, x: punto.x - enPlano.x * escala, y: punto.y - enPlano.y * escala });
  }

  function alRueda(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const puntero = escenario.current?.getPointerPosition();
    if (!puntero || !vista) return;
    zoomEn(puntero, vista.escala * (e.evt.deltaY > 0 ? 0.9 : 1.1));
  }

  function alMoverDedos(e: KonvaEventObject<TouchEvent>) {
    const [a, b] = Array.from(e.evt.touches);
    if (!a || !b || !vista) return;
    e.evt.preventDefault();
    const st = escenario.current!;
    if (st.isDragging()) st.stopDrag();
    const rect = st.container().getBoundingClientRect();
    const distancia = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const centro = { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top };
    if (!pellizco.current) {
      pellizco.current = { distancia, escala: vista.escala };
      return;
    }
    zoomEn(centro, pellizco.current.escala * (distancia / pellizco.current.distancia));
  }

  const lineasGrilla = useMemo(() => {
    if (modo !== 'edicion') return [];
    const lineas: number[][] = [];
    for (let x = 0; x <= sector.ancho; x += GRILLA) lineas.push([x, 0, x, sector.alto]);
    for (let y = 0; y <= sector.alto; y += GRILLA) lineas.push([0, y, sector.ancho, y]);
    return lineas;
  }, [modo, sector.ancho, sector.alto]);

  return (
    <div ref={caja} className="w-full touch-none overflow-hidden rounded-lg bg-lienzo" style={{ height: alto }}>
      {colores && vista && ancho > 0 ? (
        <Stage
          ref={escenario}
          width={ancho}
          height={alto}
          scaleX={vista.escala}
          scaleY={vista.escala}
          x={vista.x}
          y={vista.y}
          draggable
          onDragEnd={(e) => {
            if (e.target === escenario.current) setVista({ ...vista, x: e.target.x(), y: e.target.y() });
          }}
          onWheel={alRueda}
          onTouchMove={alMoverDedos}
          onTouchEnd={() => {
            pellizco.current = null;
          }}
          onMouseDown={(e) => {
            if (e.target === escenario.current || e.target.name() === 'fondo') alSeleccionar?.(null);
          }}
          onTap={(e) => {
            if (e.target === escenario.current || e.target.name() === 'fondo') alSeleccionar?.(null);
          }}
        >
          <Layer>
            <Rect name="fondo" width={sector.ancho} height={sector.alto} fill={colores.elevada} stroke={colores.borde} strokeWidth={1} cornerRadius={6} />
            {lineasGrilla.map((l, i) => (
              <Line key={i} points={l} stroke={colores.borde} strokeWidth={0.5} listening={false} />
            ))}
            {elementos.map((el) => (
              <Elemento
                key={el.id}
                elemento={el}
                colores={colores}
                modo={modo}
                marca={el.tipo === 'mesa' ? marcaDeMesa?.(el.id) : undefined}
                seleccionado={el.id === seleccionado}
                alSeleccionar={() => alSeleccionar?.(el.id)}
                alMover={(x, y) => alCambiarElemento?.(el.id, { x, y })}
                alTocarMesa={() => alTocarMesa?.(el.id)}
              />
            ))}
            {modo === 'edicion' ? (
              <Transformer
                ref={transformador}
                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                rotationSnapTolerance={8}
                keepRatio={false}
                anchorSize={14}
                borderStroke={colores.acento}
                anchorStroke={colores.acento}
                anchorFill={colores.elevada}
                boundBoxFunc={(viejo, nuevo) => (nuevo.width < GRILLA || nuevo.height < GRILLA / 2 ? viejo : nuevo)}
                onTransformEnd={(e) => {
                  const nodo = e.target;
                  const elemento = elementos.find((el) => el.id === nodo.id());
                  if (!elemento) return;
                  const anchoNuevo = Math.max(GRILLA, ajustar(elemento.ancho * nodo.scaleX()));
                  const altoNuevo = Math.max(GRILLA / 2, ajustar(elemento.alto * nodo.scaleY()));
                  nodo.scale({ x: 1, y: 1 });
                  alCambiarElemento?.(elemento.id, {
                    ancho: elemento.forma === 'redonda' ? Math.max(anchoNuevo, altoNuevo) : anchoNuevo,
                    alto: elemento.forma === 'redonda' ? Math.max(anchoNuevo, altoNuevo) : altoNuevo,
                    rotacion: Math.round(nodo.rotation()) % 360,
                    x: ajustar(nodo.x()),
                    y: ajustar(nodo.y()),
                  });
                }}
              />
            ) : null}
          </Layer>
        </Stage>
      ) : null}
    </div>
  );
}
