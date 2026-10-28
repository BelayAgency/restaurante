'use client';

/*
 * REFERENCIA DE MAPAS — se copia a componentes del proyecto cuando el sistema
 * lleva mapa. Dependencias: leaflet, react-leaflet, maplibre-gl,
 * @maplibre/maplibre-gl-leaflet. Los estilos que la acompañan están en
 * estilos-mapa.css (popups tokenizados y el pin de gota).
 *
 * Requisito de bundler: copiar maplibre-gl-worker.mjs y
 * maplibre-gl-shared.mjs desde node_modules/maplibre-gl/dist a /public
 * (ver el setWorkerUrl de abajo), y recopiarlos al actualizar la dependencia.
 */

import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-leaflet';
import L from 'leaflet';
import { setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';

/*
 * MapLibre carga su web worker con una URL relativa al bundle, que Turbopack
 * no resuelve: el pedido devuelve HTML y el mapa muere sin dibujar un tile.
 * Por eso el worker (y el módulo compartido que importa) se sirven como
 * estáticos desde /public — son copias de node_modules/maplibre-gl/dist y hay
 * que recopiarlas al actualizar la dependencia.
 */
setWorkerUrl('/maplibre-gl-worker.mjs');

/*
 * La capa base de todo mapa del sistema: OpenFreeMap (tiles vectoriales, sin
 * API key ni costo por vista) vestido con las paletas de Google Maps.
 *
 * La base es el estilo Liberty y encima se pisan colores por id de capa,
 * calcados de los temas del generador oficial (mapstyle.withgoogle.com):
 * Standard para el tema claro y Dark para el oscuro. Se eligió esta vía y no
 * Google Maps de verdad porque el look es lo único que se quería de Google —
 * la API cobra por vista y pide key. Si OpenFreeMap renombrara una capa, ese
 * override deja de aplicar y la capa vuelve al color de Liberty: se degrada,
 * no se rompe.
 */
const ESTILO_BASE = 'https://tiles.openfreemap.org/styles/liberty';

interface PaletaMapa {
  rellenos: Record<string, string>;
  lineas: Record<string, string>;
  /** Texto y halo de TODAS las etiquetas; solo hace falta en el oscuro. */
  simbolos?: { texto: string; halo: string };
}

/* Tema claro: la paleta del Google Maps ACTUAL, muestreada píxel por píxel de
   sus tiles reales (no la clásica del wizard, que tenía autopistas amarillas):
   agua teal #90daee, fondo #f7f7f7, vegetación menta #c3f1d5, autopistas
   gris azuladas #abbcd6 y el resto de las vías en blanco. */
const PALETA_CLARA: PaletaMapa = {
  rellenos: {
    background: '#f7f7f7',
    landuse_residential: '#f4f4f4',
    building: '#ededed',
    water: '#90daee',
    park: '#c3f1d5',
    landcover_wood: '#b5eccb',
    landcover_grass: '#cdf4dd',
    landuse_pitch: '#b8eccd',
    landuse_track: '#b8eccd',
    landuse_cemetery: '#c3e5d0',
    landuse_school: '#eff1f3',
    landuse_hospital: '#f6eff3',
    landcover_sand: '#f3f0e7',
    aeroway_fill: '#e7ebef',
  },
  lineas: {
    waterway_river: '#90daee',
    waterway_other: '#90daee',
    waterway_tunnel: '#90daee',
    road_motorway: '#abbcd6',
    road_motorway_casing: '#98a9c6',
    road_motorway_link: '#abbcd6',
    road_motorway_link_casing: '#98a9c6',
    bridge_motorway: '#abbcd6',
    bridge_motorway_casing: '#98a9c6',
    bridge_motorway_link: '#abbcd6',
    bridge_motorway_link_casing: '#98a9c6',
    tunnel_motorway: '#c8d2e2',
    tunnel_motorway_casing: '#b4c0d6',
    tunnel_motorway_link: '#c8d2e2',
    tunnel_motorway_link_casing: '#b4c0d6',
    road_trunk_primary: '#ffffff',
    road_trunk_primary_casing: '#d6d9dd',
    road_secondary_tertiary: '#ffffff',
    road_secondary_tertiary_casing: '#d6d9dd',
    road_link: '#ffffff',
    road_link_casing: '#d6d9dd',
    bridge_trunk_primary: '#ffffff',
    bridge_trunk_primary_casing: '#d6d9dd',
    bridge_secondary_tertiary: '#ffffff',
    bridge_secondary_tertiary_casing: '#d6d9dd',
    bridge_link: '#ffffff',
    bridge_link_casing: '#d6d9dd',
    tunnel_trunk_primary: '#f1f2f4',
    tunnel_trunk_primary_casing: '#e0e2e6',
    tunnel_secondary_tertiary: '#f1f2f4',
    tunnel_secondary_tertiary_casing: '#e0e2e6',
    tunnel_link: '#f1f2f4',
    tunnel_link_casing: '#e0e2e6',
  },
};

/* Tema Dark del generador: base #212121, agua negra, autopistas #3c3c3c,
   arterias #373737, calles #2c2c2c, etiquetas #757575 con halo #212121. */
const PALETA_OSCURA: PaletaMapa = {
  rellenos: {
    background: '#212121',
    landuse_residential: '#212121',
    building: '#292929',
    water: '#000000',
    park: '#181818',
    landcover_wood: '#1a1a1a',
    landcover_grass: '#1f1f1f',
    landcover_ice: '#242424',
    landuse_pitch: '#1f1f1f',
    landuse_track: '#1f1f1f',
    landcover_wetland: '#181818',
    landuse_cemetery: '#1c1c1c',
    landuse_school: '#262626',
    landuse_hospital: '#262626',
    landcover_sand: '#262626',
    aeroway_fill: '#2b2b2b',
  },
  lineas: {
    park_outline: '#181818',
    waterway_river: '#000000',
    waterway_other: '#000000',
    waterway_tunnel: '#000000',
    aeroway_runway: '#2f2f2f',
    aeroway_taxiway: '#2f2f2f',
    road_motorway: '#3c3c3c',
    road_motorway_casing: '#2c2c2c',
    road_motorway_link: '#3c3c3c',
    road_motorway_link_casing: '#2c2c2c',
    bridge_motorway: '#3c3c3c',
    bridge_motorway_casing: '#2c2c2c',
    bridge_motorway_link: '#3c3c3c',
    bridge_motorway_link_casing: '#2c2c2c',
    tunnel_motorway: '#303030',
    tunnel_motorway_casing: '#262626',
    tunnel_motorway_link: '#303030',
    tunnel_motorway_link_casing: '#262626',
    road_trunk_primary: '#373737',
    road_trunk_primary_casing: '#2a2a2a',
    bridge_trunk_primary: '#373737',
    bridge_trunk_primary_casing: '#2a2a2a',
    tunnel_trunk_primary: '#2d2d2d',
    tunnel_trunk_primary_casing: '#242424',
    road_secondary_tertiary: '#323232',
    road_secondary_tertiary_casing: '#282828',
    bridge_secondary_tertiary: '#323232',
    bridge_secondary_tertiary_casing: '#282828',
    tunnel_secondary_tertiary: '#2a2a2a',
    tunnel_secondary_tertiary_casing: '#232323',
    road_link: '#333333',
    road_link_casing: '#282828',
    bridge_link: '#333333',
    bridge_link_casing: '#282828',
    tunnel_link: '#2a2a2a',
    tunnel_link_casing: '#232323',
    road_minor: '#2c2c2c',
    road_minor_casing: '#232323',
    tunnel_minor: '#262626',
    road_service_track: '#2c2c2c',
    road_service_track_casing: '#232323',
    bridge_service_track: '#2c2c2c',
    bridge_service_track_casing: '#232323',
    tunnel_service_track: '#262626',
    tunnel_service_track_casing: '#232323',
    bridge_street: '#2c2c2c',
    bridge_street_casing: '#232323',
    tunnel_street_casing: '#232323',
    road_path_pedestrian: '#2e2e2e',
    tunnel_path_pedestrian: '#2a2a2a',
    bridge_path_pedestrian: '#2e2e2e',
    bridge_path_pedestrian_casing: '#232323',
    road_major_rail: '#3a3a3a',
    road_major_rail_hatching: '#3a3a3a',
    road_transit_rail: '#3a3a3a',
    road_transit_rail_hatching: '#3a3a3a',
    bridge_major_rail: '#3a3a3a',
    bridge_major_rail_hatching: '#3a3a3a',
    bridge_transit_rail: '#3a3a3a',
    bridge_transit_rail_hatching: '#3a3a3a',
    tunnel_major_rail: '#333333',
    tunnel_major_rail_hatching: '#333333',
    tunnel_transit_rail: '#333333',
    tunnel_transit_rail_hatching: '#333333',
    boundary_3: '#3f3f3f',
    boundary_2: '#4e4e4e',
    boundary_disputed: '#4e4e4e',
  },
  simbolos: { texto: '#757575', halo: '#212121' },
};

/* El JSON base se baja una vez; cada tema se deriva y cachea por separado. */
let baseLiberty: Promise<StyleSpecification> | null = null;
const derivados = new Map<PaletaMapa, Promise<StyleSpecification>>();

function estiloConPaleta(paleta: PaletaMapa): Promise<StyleSpecification> {
  baseLiberty ??= fetch(ESTILO_BASE).then((r) => r.json());

  let derivado = derivados.get(paleta);
  if (!derivado) {
    derivado = baseLiberty.then((base) => {
      const estilo = structuredClone(base);
      for (const capa of estilo.layers) {
        if (capa.type === 'background' && paleta.rellenos[capa.id]) {
          capa.paint = { ...capa.paint, 'background-color': paleta.rellenos[capa.id] };
        }
        if (capa.type === 'fill' && paleta.rellenos[capa.id]) {
          capa.paint = { ...capa.paint, 'fill-color': paleta.rellenos[capa.id] };
          // Un fill-pattern (ej. el humedal de la Reserva) pisa al color: si
          // el tema pide un color para la capa, el patrón se va.
          delete capa.paint['fill-pattern'];
        }
        if (capa.type === 'line' && paleta.lineas[capa.id]) {
          capa.paint = { ...capa.paint, 'line-color': paleta.lineas[capa.id] };
        }
        if (capa.type === 'symbol' && paleta.simbolos) {
          capa.paint = {
            ...capa.paint,
            'text-color': paleta.simbolos.texto,
            'text-halo-color': paleta.simbolos.halo,
          };
        }
      }
      return estilo;
    });
    derivados.set(paleta, derivado);
  }
  return derivado;
}

export function CapaMapa() {
  const mapa = useMap();
  const [oscuro, setOscuro] = useState(false);

  // El SelectorTema togglea la clase `dark` en <html>; se la sigue en vivo
  // para que el mapa acompañe el cambio de tema sin recargar.
  useEffect(() => {
    const html = document.documentElement;
    const leer = () => setOscuro(html.classList.contains('dark'));
    leer();

    const observador = new MutationObserver(leer);
    observador.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observador.disconnect();
  }, []);

  // La capa se maneja imperativamente: el plugin de MapLibre para Leaflet no
  // tiene componente de react-leaflet. Cambiar de tema desmonta y recrea.
  useEffect(() => {
    let capa: L.MaplibreGL | null = null;
    let desmontado = false;

    // La atribución no se declara acá: viaja en el propio estilo y el plugin
    // la agrega al control de Leaflet.
    const montar = (estilo: string | StyleSpecification) => {
      if (desmontado) return;
      capa = L.maplibreGL({ style: estilo });
      capa.addTo(mapa);
    };

    // Si el armado del estilo falla, Liberty pelado sigue siendo un mapa.
    estiloConPaleta(oscuro ? PALETA_OSCURA : PALETA_CLARA)
      .then(montar)
      .catch((error) => {
        console.error('No se pudo armar el estilo del mapa:', error);
        montar(ESTILO_BASE);
      });

    return () => {
      desmontado = true;
      if (capa) mapa.removeLayer(capa);
    };
  }, [mapa, oscuro]);

  return null;
}
