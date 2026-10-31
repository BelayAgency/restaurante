import type { EventoNuevo } from './eventos';
import { saldoCuenta, type Cuenta } from './reductores/salon';
import type { Rol } from './roles';

/**
 * Qué acciones necesitan el PIN de alguien con más responsabilidad, en el
 * momento y con un motivo. La regla es una sola y corre igual en el
 * dispositivo (sin red, es la única que hay) y en el servidor (que la vuelve a
 * aplicar y rechaza lo que llegue sin autorización).
 */

export const ACCIONES_AUTORIZABLES = {
  descuento: 'Descuento',
  cambiar_precio: 'Cambiar un precio en la cuenta',
  reabrir_cuenta: 'Reabrir una cuenta cerrada',
  cambiar_medio_pago: 'Cambiar el medio de pago de un cobro',
  modificar_tras_precuenta: 'Modificar una cuenta después de la precuenta',
  cerrar_sin_cobrar: 'Cerrar una cuenta sin cobrar',
  salida_caja: 'Retiro o egreso de caja',
} as const;

export type AccionAutorizable = keyof typeof ACCIONES_AUTORIZABLES;
export const LISTA_ACCIONES = Object.keys(ACCIONES_AUTORIZABLES) as AccionAutorizable[];

export function esAccionAutorizable(valor: string): valor is AccionAutorizable {
  return valor in ACCIONES_AUTORIZABLES;
}

export type ReglasAutorizacion = Record<AccionAutorizable, Rol[]>;

export const REGLAS_POR_DEFECTO: ReglasAutorizacion = Object.fromEntries(
  LISTA_ACCIONES.map((a) => [a, ['dueno', 'encargado'] as Rol[]]),
) as ReglasAutorizacion;

const DIRECTAS: Partial<Record<EventoNuevo['tipo'], AccionAutorizable>> = {
  precio_modificado: 'cambiar_precio',
  descuento_aplicado: 'descuento',
  cuenta_reabierta: 'reabrir_cuenta',
  cobro_corregido: 'cambiar_medio_pago',
  salida_caja: 'salida_caja',
};

// Lo que cambia lo que se va a cobrar. Después de una precuenta, el cliente ya
// vio un total: cambiarlo sin que nadie lo autorice es la forma más simple de
// cobrar una cosa y anotar otra. Anular y regalar no lo piden nunca, por
// decisión del cliente: se confirman en pantalla y quedan auditados con quién lo hizo.
const MODIFICAN_CUENTA = new Set<EventoNuevo['tipo']>(['item_agregado', 'item_quitado', 'items_transferidos', 'cuentas_unidas']);

/** La acción que este evento necesita autorizar, o `null` si va sin autorización. */
export function autorizacionRequerida(evento: EventoNuevo, cuenta: Cuenta | undefined): AccionAutorizable | null {
  const directa = DIRECTAS[evento.tipo];
  if (directa) return directa;
  if (evento.tipo === 'cuenta_cerrada') return cuenta && saldoCuenta(cuenta) > 0 ? 'cerrar_sin_cobrar' : null;
  if (cuenta && cuenta.precuentas.length > 0 && MODIFICAN_CUENTA.has(evento.tipo)) return 'modificar_tras_precuenta';
  return null;
}

export function puedeAutorizar(rol: Rol, accion: AccionAutorizable, reglas: Partial<ReglasAutorizacion>): boolean {
  return (reglas[accion] ?? REGLAS_POR_DEFECTO[accion]).includes(rol);
}

export interface MotivoAutorizacion {
  id: string;
  accion: AccionAutorizable;
  texto: string;
}
