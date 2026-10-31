'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Arc, Circle, Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { ElementoPlano, SectorCatalogo, TipoElemento } from '@/dominio/catalogo';
import { cn } from '@/lib/cn';
import { useColoresTema, type ColoresTema, type TokenColor } from './colores-tema';
import { GRILLA } from './constantes';

/**
 * El plano del local en canvas. Lo comparten la operación (todos ven las
 * mesas y las abren con el dedo) y el modo edición (el dueño arma el salón).
 * Ocupa todo el alto y el ancho de su contenedor. Las coordenadas de cada
 * elemento son su centro, así rotar no lo corre de lugar.
 */

const ESCALA_MIN = 0.2;
const ESCALA_MAX = 4;

export type TonoMesa = 'libre' | 'ocupada';

export interface MarcaMesa {
  tono: TonoMesa;
  /** Una o dos líneas cortas debajo del número: tiempo, total. */
  lineas: string[];
  /** Debajo de la mesa, afuera: quién la atiende. */
  pie?: string;
  /** Sillas ocupadas: se pintan con el color del estado. */
  ocupadas?: number;
}

/** Lo que el plano deja libre para las barras flotantes de arriba y abajo. */
export interface Margenes {
  arriba: number;
  abajo: number;
  izquierda: number;
  derecha: number;
}

// Ocupada va en el acento lleno, con el número en blanco como un botón primario:
// es lo único que el plano distingue, y tiene que verse de lejos.
const TONO: Record<TonoMesa, { relleno: TokenColor; borde: TokenColor; texto?: TokenColor }> = {
  libre: { relleno: 'superficie', borde: 'borde-fuerte' },
  ocupada: { relleno: 'acento', borde: 'acento', texto: 'perilla' },
};

type TipoFijo = Exclude<TipoElemento, 'mesa'>;

const FIJO: Record<
  TipoFijo,
  {
    relleno: TokenColor;
    borde?: TokenColor;
    etiqueta: string;
    punteado?: boolean;
  }
> = {
  pared: { relleno: 'tinta-suave', etiqueta: '' },
  ventana: { relleno: 'acento-tenue', borde: 'acento', etiqueta: '' },
  barra: { relleno: 'borde-fuerte', etiqueta: 'Barra' },
  columna: { relleno: 'tinta-tenue', etiqueta: '' },
  puerta: { relleno: 'superficie', borde: 'borde-fuerte', etiqueta: '' },
  cocina: {
    relleno: 'alerta-tenue',
    borde: 'alerta',
    etiqueta: 'Cocina',
    punteado: true,
  },
  bano: { relleno: 'superficie', borde: 'borde-fuerte', etiqueta: 'Baños' },
  caja: { relleno: 'exito-tenue', borde: 'exito', etiqueta: 'Caja' },
  planta: { relleno: 'exito-tenue', borde: 'exito', etiqueta: '' },
  texto: { relleno: 'tinta-suave', etiqueta: 'Texto' },
};

export const ETIQUETA_FIJA: Record<TipoFijo, string> = Object.fromEntries(Object.entries(FIJO).map(([t, f]) => [t, f.etiqueta])) as Record<TipoFijo, string>;

function ajustar(valor: number) {
  return Math.round(valor / GRILLA) * GRILLA;
}

/** Media altura de la caja que ocupa el elemento ya rotado: para ubicar lo que va arriba y abajo. */
function medioAltoRotado(e: ElementoPlano) {
  const r = (e.rotacion * Math.PI) / 180;
  return (Math.abs(e.ancho * Math.sin(r)) + Math.abs(e.alto * Math.cos(r))) / 2;
}

/** Un texto girado más de 90° se leería cabeza abajo: se da vuelta. */
function rotacionLegible(rotacion: number) {
  const r = ((rotacion % 360) + 360) % 360;
  return r > 90 && r <= 270 ? 180 : 0;
}

interface Silla {
  x: number;
  y: number;
  rotacion: number;
}

/** Las sillas alrededor de la mesa, en el marco de la mesa (antes de rotar). */
function sillasDe(e: ElementoPlano): Silla[] {
  const n = Math.min(e.capacidad ?? 0, 16);
  if (!n) return [];
  if (e.forma === 'redonda') {
    const radio = Math.min(e.ancho, e.alto) / 2 + 9;
    return Array.from({ length: n }, (_, i) => {
      const angulo = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        x: Math.cos(angulo) * radio,
        y: Math.sin(angulo) * radio,
        rotacion: (angulo * 180) / Math.PI + 90,
      };
    });
  }
  // En una rectangular se reparten por los lados largos; con una sola, en la cabecera.
  const horizontal = e.ancho >= e.alto;
  const largo = horizontal ? e.ancho : e.alto;
  const corto = horizontal ? e.alto : e.ancho;
  if (n === 1) return [horizontal ? { x: 0, y: -corto / 2 - 9, rotacion: 0 } : { x: corto / 2 + 9, y: 0, rotacion: 90 }];
  const lados = [Math.ceil(n / 2), Math.floor(n / 2)];
  const sillas: Silla[] = [];
  lados.forEach((cantidad, lado) => {
    for (let i = 0; i < cantidad; i++) {
      const a = -largo / 2 + (largo / cantidad) * (i + 0.5);
      const b = (lado === 0 ? -1 : 1) * (corto / 2 + 9);
      sillas.push(horizontal ? { x: a, y: b, rotacion: lado === 0 ? 0 : 180 } : { x: b, y: a, rotacion: lado === 0 ? -90 : 90 });
    }
  });
  return sillas;
}

function Mesa({ e, colores, marca, seleccionada, encima }: { e: ElementoPlano; colores: ColoresTema; marca?: MarcaMesa; seleccionada: boolean; encima: boolean }) {
  const tono = TONO[marca?.tono ?? 'libre'];
  const relleno = colores[tono.relleno];
  // La abierta en el panel se marca con un borde de tinta, no del acento: sobre una ocupada no se vería.
  const borde = seleccionada ? colores.tinta : colores[tono.borde];
  const grosor = seleccionada ? 3 : 2;
  const sillas = sillasDe(e);
  const ocupadas = marca?.ocupadas ?? 0;
  const alto = Math.min(e.ancho, e.alto);

  return (
    <>
      {sillas.map((s, i) => (
        <Rect
          key={i}
          x={s.x}
          y={s.y}
          offsetX={10}
          offsetY={5}
          width={20}
          height={10}
          rotation={s.rotacion}
          cornerRadius={4}
          fill={i < ocupadas ? colores[tono.borde] : colores.superficie}
          stroke={colores['borde-fuerte']}
          strokeWidth={i < ocupadas ? 0 : 1}
          listening={false}
        />
      ))}
      {e.forma === 'redonda' ? (
        <Circle radius={alto / 2} fill={relleno} stroke={borde} strokeWidth={grosor} shadowColor="black" shadowOpacity={0.04} shadowBlur={3} shadowOffsetY={1} />
      ) : (
        <Rect
          x={-e.ancho / 2}
          y={-e.alto / 2}
          width={e.ancho}
          height={e.alto}
          cornerRadius={5}
          fill={relleno}
          stroke={borde}
          strokeWidth={grosor}
          shadowColor="black"
          shadowOpacity={0.04}
          shadowBlur={3}
          shadowOffsetY={1}
        />
      )}
      {/* El canvas no compone colores con color-mix: el hover se oscurece (o
          aclara, en oscuro) con una capa de tinta encima del relleno de cada tono. */}
      {encima ? (
        e.forma === 'redonda' ? (
          <Circle radius={alto / 2} fill={colores.tinta} opacity={0.08} listening={false} />
        ) : (
          <Rect x={-e.ancho / 2} y={-e.alto / 2} width={e.ancho} height={e.alto} cornerRadius={5} fill={colores.tinta} opacity={0.08} listening={false} />
        )
      ) : null}
    </>
  );
}

/** Lo que se lee derecho aunque la mesa esté girada: número, tiempo, total y mozo. */
function TextosMesa({ e, colores, marca, modo }: { e: ElementoPlano; colores: ColoresTema; marca?: MarcaMesa; modo: 'edicion' | 'operacion' }) {
  const lineas = marca?.lineas ?? (modo === 'edicion' && e.capacidad ? [`${e.capacidad} lugares`] : []);
  const alto = Math.min(e.ancho, e.alto);
  const tamanoNumero = Math.max(14, Math.min(22, alto / 3.5));
  const ancho = Math.max(e.ancho, 120);
  const medio = medioAltoRotado(e) + (e.capacidad ? 14 : 0);
  const bloque = tamanoNumero + lineas.length * 13;

  return (
    <Group x={e.x} y={e.y} listening={false}>
      <Text text={String(e.numeroMesa ?? '')} fontSize={tamanoNumero} fontStyle="600" fill={colores[TONO[marca?.tono ?? 'libre'].texto ?? 'tinta']} width={ancho} x={-ancho / 2} y={-bloque / 2} align="center" />
      {lineas.map((linea, i) => (
        <Text key={i} text={linea} fontSize={11} fill={colores[TONO[marca?.tono ?? 'libre'].texto ?? 'tinta-suave']} width={ancho} x={-ancho / 2} y={-bloque / 2 + tamanoNumero + 2 + i * 13} align="center" />
      ))}
      {marca?.pie ? <Text text={marca.pie} fontSize={11} fill={colores['tinta-tenue']} width={160} x={-80} y={medio + 2} align="center" /> : null}
    </Group>
  );
}

function Fijo({ e, colores, modo, seleccionado }: { e: ElementoPlano; colores: ColoresTema; modo: 'edicion' | 'operacion'; seleccionado: boolean }) {
  const tipo = e.tipo as TipoFijo;
  const estilo = FIJO[tipo];
  const { ancho, alto } = e;
  const trazo = seleccionado ? colores.acento : estilo.borde ? colores[estilo.borde] : undefined;
  const grosor = seleccionado ? 2.5 : estilo.borde ? 1 : 0;
  const etiqueta = e.etiqueta?.trim() || estilo.etiqueta;
  const giroTexto = rotacionLegible(e.rotacion);

  if (tipo === 'texto') {
    return (
      <>
        <Rect
          x={-ancho / 2}
          y={-alto / 2}
          width={ancho}
          height={alto}
          fill="transparent"
          stroke={modo === 'edicion' ? (seleccionado ? colores.acento : colores['borde-fuerte']) : undefined}
          strokeWidth={modo === 'edicion' ? 1 : 0}
          dash={[4, 4]}
        />
        <Text
          text={etiqueta}
          fontSize={Math.max(10, Math.min(48, alto * 0.6))}
          fontStyle="600"
          fill={colores['tinta-suave']}
          width={ancho}
          height={alto}
          offsetX={ancho / 2}
          offsetY={alto / 2}
          rotation={giroTexto}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </>
    );
  }

  if (tipo === 'planta') {
    const r = Math.min(ancho, alto) / 2;
    return (
      <>
        <Circle radius={r} fill={colores[estilo.relleno]} stroke={trazo} strokeWidth={grosor} />
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return <Circle key={i} x={Math.cos(a) * r * 0.45} y={Math.sin(a) * r * 0.45} radius={r * 0.38} fill={colores.exito} opacity={0.35} listening={false} />;
        })}
      </>
    );
  }

  if (tipo === 'caja') {
    // El mostrador visto desde arriba: el cajero del lado de arriba, el cliente
    // del de abajo, y sobre la mesada la registradora con su cajón y el posnet.
    const equipo = Math.min(alto * 0.42, ancho * 0.22);
    const izquierda = -ancho / 2 + 12;
    const arriba = -alto / 2 + 10;
    const registradora = equipo * 1.3;
    const pantalla = equipo * 0.8;
    const cajon = equipo * 0.55;
    const posnet = { x: izquierda + registradora + 10, ancho: equipo * 0.45, alto: equipo * 0.75 };
    const desdeTexto = posnet.x + posnet.ancho + 8;
    const anchoTexto = ancho / 2 - desdeTexto;
    const equipoBorde = colores.exito;
    return (
      <>
        <Circle y={-alto / 2 - 14} radius={10} fill={colores.superficie} stroke={colores['borde-fuerte']} strokeWidth={1} listening={false} />
        <Rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} cornerRadius={6} fill={colores[estilo.relleno]} stroke={trazo} strokeWidth={grosor} />
        <Line points={[-ancho / 2 + 6, alto / 2 - 10, ancho / 2 - 6, alto / 2 - 10]} stroke={equipoBorde} strokeWidth={1} opacity={0.5} listening={false} />
        <Group listening={false}>
          <Rect x={izquierda} y={arriba} width={registradora} height={pantalla} cornerRadius={3} fill={colores.superficie} stroke={equipoBorde} strokeWidth={1} />
          <Rect x={izquierda + 4} y={arriba + 4} width={registradora - 8} height={pantalla - 8} cornerRadius={2} fill={colores['exito-tenue']} />
          <Rect x={izquierda} y={arriba + pantalla + 4} width={registradora} height={cajon} cornerRadius={3} fill={colores.superficie} stroke={equipoBorde} strokeWidth={1} />
          <Line points={[izquierda + registradora * 0.3, arriba + pantalla + 4 + cajon / 2, izquierda + registradora * 0.7, arriba + pantalla + 4 + cajon / 2]} stroke={equipoBorde} strokeWidth={1.5} lineCap="round" />
          <Rect x={posnet.x} y={arriba} width={posnet.ancho} height={posnet.alto} cornerRadius={4} fill={colores.superficie} stroke={equipoBorde} strokeWidth={1} />
          <Rect x={posnet.x + 3} y={arriba + 3} width={posnet.ancho - 6} height={posnet.alto * 0.35} cornerRadius={1.5} fill={colores['exito-tenue']} />
        </Group>
        {etiqueta && anchoTexto > 20 ? (
          <Group x={desdeTexto + anchoTexto / 2} rotation={giroTexto} listening={false}>
            <Text text={etiqueta} fontSize={Math.max(10, Math.min(14, alto * 0.4))} fontStyle="500" fill={colores['tinta-suave']} width={anchoTexto} height={alto} offsetX={anchoTexto / 2} offsetY={alto / 2} align="center" verticalAlign="middle" />
          </Group>
        ) : null}
      </>
    );
  }

  if (tipo === 'columna' && e.forma === 'redonda') {
    return <Circle radius={Math.min(ancho, alto) / 2} fill={colores[estilo.relleno]} stroke={trazo} strokeWidth={grosor} />;
  }

  return (
    <>
      <Rect
        x={-ancho / 2}
        y={-alto / 2}
        width={ancho}
        height={alto}
        cornerRadius={tipo === 'barra' ? 8 : tipo === 'pared' || tipo === 'ventana' ? 1 : 4}
        fill={colores[estilo.relleno]}
        stroke={trazo}
        strokeWidth={grosor}
        dash={estilo.punteado && !seleccionado ? [6, 4] : undefined}
      />
      {tipo === 'ventana' ? <Line points={[-ancho / 2 + 4, 0, ancho / 2 - 4, 0]} stroke={colores.acento} strokeWidth={1} listening={false} /> : null}
      {tipo === 'puerta' ? (
        // La hoja abierta y su recorrido: dice para dónde abre.
        <>
          <Line points={[-ancho / 2, -alto / 2, -ancho / 2, -alto / 2 - ancho]} stroke={colores['tinta-tenue']} strokeWidth={1.5} listening={false} />
          <Arc x={-ancho / 2} y={-alto / 2} innerRadius={ancho} outerRadius={ancho} angle={90} rotation={-90} stroke={colores['tinta-tenue']} strokeWidth={1} dash={[4, 4]} listening={false} />
        </>
      ) : null}
      {etiqueta ? (
        <Text
          text={etiqueta}
          fontSize={Math.max(10, Math.min(14, alto * 0.4))}
          fontStyle="500"
          fill={tipo === 'barra' ? colores.tinta : colores['tinta-suave']}
          width={ancho}
          height={alto}
          offsetX={ancho / 2}
          offsetY={alto / 2}
          rotation={giroTexto}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      ) : null}
    </>
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
  margenes = { arriba: 16, abajo: 16, izquierda: 16, derecha: 16 },
  claseControles,
  estiloControles,
}: {
  sector: SectorCatalogo;
  elementos: ElementoPlano[];
  modo: 'edicion' | 'operacion';
  seleccionado?: string | null;
  alSeleccionar?: (id: string | null) => void;
  alCambiarElemento?: (id: string, cambios: Partial<ElementoPlano>) => void;
  marcaDeMesa?: (mesaId: string) => MarcaMesa | undefined;
  alTocarMesa?: (mesaId: string) => void;
  margenes?: Margenes;
  /** Dónde van los botones de zoom: cada pantalla sabe qué tiene encima. */
  claseControles?: string;
  estiloControles?: CSSProperties;
}) {
  const colores = useColoresTema();
  const caja = useRef<HTMLDivElement>(null);
  const escenario = useRef<Konva.Stage>(null);
  const transformador = useRef<Konva.Transformer>(null);
  const [medida, setMedida] = useState({ ancho: 0, alto: 0 });
  const [vista, setVista] = useState<{
    escala: number;
    x: number;
    y: number;
  } | null>(null);
  const [encima, setEncima] = useState<string | null>(null);
  const pellizco = useRef<{ distancia: number; escala: number } | null>(null);

  useEffect(() => {
    const nodo = caja.current;
    if (!nodo) return;
    const observador = new ResizeObserver(([entrada]) =>
      setMedida({
        ancho: Math.floor(entrada!.contentRect.width),
        alto: Math.floor(entrada!.contentRect.height),
      }),
    );
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  // El plano entra entero en lo que dejan libre las barras flotantes.
  const { arriba, abajo, izquierda, derecha } = margenes;
  const vistaInicial = useMemo(() => {
    if (!medida.ancho || !medida.alto) return null;
    const libreAncho = Math.max(100, medida.ancho - izquierda - derecha);
    const libreAlto = Math.max(100, medida.alto - arriba - abajo);
    const escala = Math.min(libreAncho / sector.ancho, libreAlto / sector.alto, 1.6);
    return {
      escala,
      x: izquierda + (libreAncho - sector.ancho * escala) / 2,
      y: arriba + (libreAlto - sector.alto * escala) / 2,
    };
  }, [medida.ancho, medida.alto, sector.ancho, sector.alto, arriba, abajo, izquierda, derecha]);
  const [claveVista, setClaveVista] = useState('');
  const claveActual = `${sector.id}:${sector.ancho}x${sector.alto}:${medida.ancho}x${medida.alto}:${modo}`;
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
    const enPlano = {
      x: (punto.x - vista.x) / vista.escala,
      y: (punto.y - vista.y) / vista.escala,
    };
    setVista({
      escala,
      x: punto.x - enPlano.x * escala,
      y: punto.y - enPlano.y * escala,
    });
  }

  function zoomCentro(factor: number) {
    if (vista) zoomEn({ x: medida.ancho / 2, y: medida.alto / 2 }, vista.escala * factor);
  }

  function alRueda(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const puntero = escenario.current?.getPointerPosition();
    if (!puntero || !vista) return;
    // Con el trackpad, el pellizco llega como rueda con ctrl: más fino.
    const paso = e.evt.ctrlKey ? 0.02 : 0.1;
    zoomEn(puntero, vista.escala * (e.evt.deltaY > 0 ? 1 - paso : 1 + paso));
  }

  function alMoverDedos(e: KonvaEventObject<TouchEvent>) {
    const [a, b] = Array.from(e.evt.touches);
    if (!a || !b || !vista) return;
    e.evt.preventDefault();
    const st = escenario.current!;
    if (st.isDragging()) st.stopDrag();
    const rect = st.container().getBoundingClientRect();
    const distancia = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const centro = {
      x: (a.clientX + b.clientX) / 2 - rect.left,
      y: (a.clientY + b.clientY) / 2 - rect.top,
    };
    if (!pellizco.current) {
      pellizco.current = { distancia, escala: vista.escala };
      return;
    }
    zoomEn(centro, pellizco.current.escala * (distancia / pellizco.current.distancia));
  }

  const lineasGrilla = useMemo(() => {
    if (modo !== 'edicion') return [];
    const lineas: { puntos: number[]; metro: boolean }[] = [];
    for (let x = 0; x <= sector.ancho; x += GRILLA) lineas.push({ puntos: [x, 0, x, sector.alto], metro: x % 100 === 0 });
    for (let y = 0; y <= sector.alto; y += GRILLA) lineas.push({ puntos: [0, y, sector.ancho, y], metro: y % 100 === 0 });
    return lineas;
  }, [modo, sector.ancho, sector.alto]);

  // Las mesas van arriba de todo lo fijo: una barra no tapa nunca una mesa.
  const ordenados = useMemo(() => [...elementos].sort((a, b) => Number(a.tipo === 'mesa') - Number(b.tipo === 'mesa')), [elementos]);
  const mesas = ordenados.filter((e) => e.tipo === 'mesa');

  function cursor(valor: string) {
    const st = escenario.current;
    if (st) st.container().style.cursor = valor;
  }

  return (
    <div ref={caja} className="relative h-full w-full touch-none overflow-hidden bg-lienzo">
      {colores && vista && medida.ancho > 0 ? (
        <Stage
          ref={escenario}
          width={medida.ancho}
          height={medida.alto}
          scaleX={vista.escala}
          scaleY={vista.escala}
          x={vista.x}
          y={vista.y}
          draggable
          onDragStart={(e) => {
            if (e.target === escenario.current) cursor('grabbing');
          }}
          onDragEnd={(e) => {
            if (e.target === escenario.current) {
              cursor('');
              setVista({ ...vista, x: e.target.x(), y: e.target.y() });
            }
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
            <Rect
              name="fondo"
              width={sector.ancho}
              height={sector.alto}
              fill={colores.lienzo}
              stroke={colores['borde-fuerte']}
              strokeWidth={2}
              cornerRadius={8}
            />
            {lineasGrilla.map((l, i) => (
              <Line key={i} points={l.puntos} stroke={colores.borde} strokeWidth={l.metro ? 1 : 0.5} opacity={l.metro ? 0.9 : 0.5} listening={false} />
            ))}
            {ordenados.map((el) => {
              const esMesa = el.tipo === 'mesa';
              const tocar = modo === 'edicion' ? () => alSeleccionar?.(el.id) : esMesa ? () => alTocarMesa?.(el.id) : undefined;
              return (
                <Group
                  key={el.id}
                  id={el.id}
                  x={el.x}
                  y={el.y}
                  rotation={el.rotacion}
                  draggable={modo === 'edicion'}
                  onDragStart={() => alSeleccionar?.(el.id)}
                  onDragMove={(e: KonvaEventObject<DragEvent>) => {
                    // Mientras se arrastra ya se ve dónde va a caer.
                    e.target.position({
                      x: ajustar(e.target.x()),
                      y: ajustar(e.target.y()),
                    });
                  }}
                  onDragEnd={(e: KonvaEventObject<DragEvent>) =>
                    alCambiarElemento?.(el.id, {
                      x: ajustar(e.target.x()),
                      y: ajustar(e.target.y()),
                    })
                  }
                  onClick={tocar}
                  onTap={tocar}
                  onMouseEnter={() => {
                    if (!tocar) return;
                    cursor(modo === 'edicion' ? 'move' : 'pointer');
                    if (esMesa && modo === 'operacion') setEncima(el.id);
                  }}
                  onMouseLeave={() => {
                    cursor('');
                    setEncima(null);
                  }}
                >
                  {esMesa ? (
                    <Mesa e={el} colores={colores} marca={marcaDeMesa?.(el.id)} seleccionada={el.id === seleccionado} encima={el.id === encima} />
                  ) : (
                    <Fijo e={el} colores={colores} modo={modo} seleccionado={el.id === seleccionado} />
                  )}
                </Group>
              );
            })}
            {/* Los textos de las mesas van en una capa propia, sin rotar: se leen derechos. */}
            {mesas.map((el) => (
              <TextosMesa key={el.id} e={el} colores={colores} marca={marcaDeMesa?.(el.id)} modo={modo} />
            ))}
            {modo === 'edicion' ? (
              <Transformer
                ref={transformador}
                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                rotationSnapTolerance={8}
                keepRatio={false}
                anchorSize={14}
                anchorCornerRadius={7}
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
                  const cuadrado = elemento.forma === 'redonda' || elemento.tipo === 'planta';
                  nodo.scale({ x: 1, y: 1 });
                  alCambiarElemento?.(elemento.id, {
                    ancho: cuadrado ? Math.max(anchoNuevo, altoNuevo) : anchoNuevo,
                    alto: cuadrado ? Math.max(anchoNuevo, altoNuevo) : altoNuevo,
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

      <div className={cn('panel-flotante absolute flex flex-col gap-0.5 p-1', claseControles ?? 'bottom-4 right-4')} style={estiloControles}>
        <BotonZoom etiqueta="Acercar" alTocar={() => zoomCentro(1.25)}>
          <Plus size={14} strokeWidth={1.75} />
        </BotonZoom>
        <BotonZoom etiqueta="Alejar" alTocar={() => zoomCentro(0.8)}>
          <Minus size={14} strokeWidth={1.75} />
        </BotonZoom>
        <BotonZoom etiqueta="Ver el plano entero" alTocar={() => vistaInicial && setVista(vistaInicial)}>
          <Maximize size={13} strokeWidth={1.75} />
        </BotonZoom>
      </div>
    </div>
  );
}

function BotonZoom({ etiqueta, alTocar, children }: { etiqueta: string; alTocar: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={alTocar}
      className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-tinta-suave hover:bg-fill-fantasma-hover hover:text-tinta"
    >
      {children}
    </button>
  );
}
