import type { MotivoAutorizacion, ReglasAutorizacion } from './autorizaciones';
import type { Rol } from './roles';

/**
 * Lo que un dispositivo necesita para operar sin red: quién puede operar, el
 * plano y la carta vigente. Lo arma el servidor y se guarda entero en el
 * dispositivo.
 */

export interface OperadorCatalogo {
  id: string;
  nombre: string;
  rol: Rol;
  pinHash: string | null;
}

export interface SectorCatalogo {
  id: string;
  nombre: string;
  orden: number;
  ancho: number;
  alto: number;
}

export const TIPOS_ELEMENTO = ['mesa', 'pared', 'barra', 'columna', 'puerta', 'cocina', 'ventana', 'bano', 'caja', 'planta', 'texto'] as const;
export type TipoElemento = (typeof TIPOS_ELEMENTO)[number];
export type FormaElemento = 'redonda' | 'rectangular';

export interface ElementoPlano {
  id: string;
  sectorId: string;
  tipo: TipoElemento;
  forma: FormaElemento;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  rotacion: number;
  numeroMesa: number | null;
  capacidad: number | null;
  /** Lo que se lee en el plano: el nombre de una barra, el texto de un cartel. */
  etiqueta: string | null;
}

export interface EstacionCatalogo {
  id: string;
  nombre: string;
  orden: number;
}

export interface CategoriaCatalogo {
  id: string;
  nombre: string;
  orden: number;
}

export interface ModificadorCatalogo {
  id: string;
  nombre: string;
  precioCentavos: number;
}

export interface GrupoCatalogo {
  id: string;
  nombre: string;
  obligatorio: boolean;
  multiple: boolean;
  modificadores: ModificadorCatalogo[];
}

export interface ProductoCatalogo {
  id: string;
  nombre: string;
  categoriaId: string;
  estacionId: string;
  disponible: boolean;
  precioId: string;
  precioCentavos: number;
  grupoIds: string[];
  /** Cambia con cada foto nueva; `null` sin foto. Un catálogo guardado antes de que hubiera fotos no la trae. */
  fotoVersion?: string | null;
}

/** La dirección de la foto lleva la versión: cambiar la foto cambia la dirección, y la vieja se puede guardar para siempre. */
export function urlFotoProducto(productoId: string, version: string): string {
  return `/api/fotos/${productoId}?v=${version}`;
}

export function urlFotoInsumo(insumoId: string, version: string): string {
  return `/api/fotos/insumos/${insumoId}?v=${version}`;
}

export interface MedioPago {
  id: string;
  nombre: string;
  efectivo: boolean;
}

export interface Catalogo {
  operadores: OperadorCatalogo[];
  sectores: SectorCatalogo[];
  elementos: ElementoPlano[];
  estaciones: EstacionCatalogo[];
  categorias: CategoriaCatalogo[];
  productos: ProductoCatalogo[];
  grupos: GrupoCatalogo[];
  medios: MedioPago[];
  motivos: MotivoAutorizacion[];
  reglas: Partial<ReglasAutorizacion>;
  /** Demo: identifica la base en memoria; si cambia, el navegador tira su copia del salón. */
  instancia?: string;
}

export const CATALOGO_VACIO: Catalogo = {
  operadores: [],
  sectores: [],
  elementos: [],
  estaciones: [],
  categorias: [],
  productos: [],
  grupos: [],
  medios: [],
  motivos: [],
  reglas: {},
};
