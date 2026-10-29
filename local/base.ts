import Dexie, { type EntityTable } from 'dexie';
import type { EventoConfirmado, EventoNuevo } from '@/dominio/eventos';
import type { Catalogo } from '@/dominio/catalogo';
import type { Rol } from '@/dominio/roles';

/**
 * La base del dispositivo. Lo que se ve en pantalla sale de acá, no de una
 * respuesta del servidor: con o sin red, la misma fuente.
 */

export interface EventoPendiente {
  id: string;
  /** Orden de creación en este dispositivo: así se reaplica la bandeja. */
  orden: number;
  evento: EventoNuevo;
  intentos: number;
  ultimoError: string | null;
}

export interface EventoRechazado {
  id: string;
  evento: EventoNuevo;
  motivo: string;
  rechazadoEn: string;
}

export interface OperadorLocal {
  id: string;
  nombre: string;
  rol: Rol;
  pinHash: string | null;
}

/** El catálogo entero en una fila: se reemplaza completo en cada sincronización. */
export interface CatalogoGuardado {
  clave: 'actual';
  valor: Catalogo;
  actualizadoEn: string;
}

/** Valores sueltos del dispositivo: su id, el cursor, el operador activo. */
export interface Ajuste {
  clave: 'dispositivo' | 'cursor' | 'operador' | 'contacto' | 'estacion';
  valor: string;
}

class BaseLocal extends Dexie {
  pendientes!: EntityTable<EventoPendiente, 'id'>;
  confirmados!: EntityTable<EventoConfirmado, 'id'>;
  rechazados!: EntityTable<EventoRechazado, 'id'>;
  operadores!: EntityTable<OperadorLocal, 'id'>;
  ajustes!: EntityTable<Ajuste, 'clave'>;
  catalogo!: EntityTable<CatalogoGuardado, 'clave'>;

  constructor() {
    super('restaurante');
    this.version(1).stores({
      pendientes: 'id, orden',
      confirmados: 'id, secuencia, tipo, agregadoId',
      rechazados: 'id, rechazadoEn',
      operadores: 'id, nombre',
      ajustes: 'clave',
    });
    this.version(2).stores({ catalogo: 'clave' });
  }
}

export const baseLocal = new BaseLocal();

export async function leerAjuste(clave: Ajuste['clave']): Promise<string | null> {
  return (await baseLocal.ajustes.get(clave))?.valor ?? null;
}

export async function guardarAjuste(clave: Ajuste['clave'], valor: string | null) {
  if (valor === null) await baseLocal.ajustes.delete(clave);
  else await baseLocal.ajustes.put({ clave, valor });
}
