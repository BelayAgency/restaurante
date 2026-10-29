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

export type TipoElemento = 'mesa' | 'pared' | 'barra' | 'columna' | 'puerta' | 'cocina';
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
};
