'use client';

import { useToast } from '@/components/toast';
import type { Catalogo, OperadorCatalogo } from '@/dominio/catalogo';
import type { DatosDe, TipoEvento } from '@/dominio/eventos';
import { EventoNoPermitido, registrarEvento } from '@/local/sync';

export interface Operador {
  id: string;
  nombre: string;
  rol: OperadorCatalogo['rol'];
}

/**
 * Registra un evento del salón a nombre del operador activo. Sin red queda en
 * la bandeja; con red sale al toque. Si el operador no tiene permiso, avisa y
 * no se registra nada.
 */
export function useRegistrar(operador: Operador) {
  const toast = useToast();
  return async function registrar<T extends TipoEvento>(tipo: T, agregadoId: string, datos: DatosDe<T>): Promise<boolean> {
    try {
      // El tipo ya ata los datos al evento; TypeScript no lo sigue a través del genérico.
      await registrarEvento(tipo, agregadoId, datos as never, operador);
      return true;
    } catch (error) {
      toast.error(error instanceof EventoNoPermitido ? error.message : 'No se pudo registrar. Probá de nuevo.');
      return false;
    }
  };
}

export function nombreMesa(catalogo: Catalogo, mesaId: string | null): string {
  if (!mesaId) return '';
  const mesa = catalogo.elementos.find((e) => e.id === mesaId);
  return mesa?.numeroMesa ? `Mesa ${mesa.numeroMesa}` : 'Mesa';
}

export function nombreOperador(catalogo: Catalogo, id: string): string {
  return catalogo.operadores.find((o) => o.id === id)?.nombre ?? '—';
}
