'use client';

import { useToast } from '@/components/toast';
import { autorizacionRequerida } from '@/dominio/autorizaciones';
import type { Catalogo, OperadorCatalogo } from '@/dominio/catalogo';
import type { DatosDe, EventoNuevo, TipoEvento } from '@/dominio/eventos';
import { reducirSalon, type Cuenta } from '@/dominio/reductores/salon';
import { baseLocal } from '@/local/base';
import { EventoNoPermitido, registrarEvento } from '@/local/sync';
import { usePedirAutorizacion } from '../autorizacion';
import { useSesion } from '../sesion-cliente';

export interface Operador {
  id: string;
  nombre: string;
  rol: OperadorCatalogo['rol'];
}

/** La cuenta tal como la ve el dispositivo ahora, para decidir si el evento necesita autorización. */
async function cuentaLocal(cuentaId: string) {
  const [confirmados, pendientes] = await Promise.all([baseLocal.confirmados.orderBy('secuencia').toArray(), baseLocal.pendientes.orderBy('orden').toArray()]);
  return reducirSalon([...confirmados, ...pendientes.map((p) => p.evento)]).cuentas.get(cuentaId);
}

/**
 * Registra un evento a nombre del operador activo. Si la acción necesita
 * autorización, la pide antes (PIN de un encargado y motivo). Sin red queda en
 * la bandeja; con red sale al toque. Si no se puede, avisa y no registra nada.
 */
export function useRegistrar(operador: Operador) {
  const toast = useToast();
  const pedirAutorizacion = usePedirAutorizacion();
  return async function registrar<T extends TipoEvento>(tipo: T, agregadoId: string, datos: DatosDe<T>): Promise<boolean> {
    try {
      const borrador = { tipo, agregadoId, datos } as unknown as EventoNuevo;
      const accion = autorizacionRequerida(borrador, tipo === 'salida_caja' ? undefined : await cuentaLocal(agregadoId));
      const autorizacion = accion ? await pedirAutorizacion(accion, operador) : undefined;
      if (accion && !autorizacion) return false;
      // El tipo ya ata los datos al evento; TypeScript no lo sigue a través del genérico.
      await registrarEvento(tipo, agregadoId, datos as never, operador, autorizacion ?? undefined);
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

/** Cómo se nombra una cuenta: su mesa, o el nombre del pedido sin mesa. */
export function nombreCuenta(catalogo: Catalogo, cuenta: Pick<Cuenta, 'tipo' | 'mesaId' | 'nombre'>): string {
  if (cuenta.tipo === 'mesa') return nombreMesa(catalogo, cuenta.mesaId);
  return cuenta.nombre ?? (cuenta.tipo === 'llevar' ? 'Para llevar' : 'Mostrador');
}

export function nombreOperador(catalogo: Catalogo, id: string): string {
  return catalogo.operadores.find((o) => o.id === id)?.nombre ?? '—';
}

/**
 * Como `nombreOperador`, pero reconoce a quien tiene la sesión aunque no esté
 * entre los operadores del catálogo (soporte no figura ahí): lo que hizo uno
 * mismo no aparece como «—».
 */
export function useNombreOperador(catalogo: Catalogo) {
  const { usuario } = useSesion();
  return (id: string) => (id === usuario.id ? usuario.nombre : nombreOperador(catalogo, id));
}
