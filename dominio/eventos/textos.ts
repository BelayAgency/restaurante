import type { TipoEvento } from './index';

export const NOMBRE_EVENTO: Record<TipoEvento, string> = {
  operador_cambiado: 'Cambio de operador',
  pin_fallido: 'PIN incorrecto',
  cuenta_abierta: 'Cuenta abierta',
  item_agregado: 'Ítem cargado',
  item_quitado: 'Ítem quitado',
  items_enviados: 'Comanda enviada',
  cuenta_movida: 'Cuenta movida de mesa',
  cuentas_unidas: 'Cuentas unidas',
  items_transferidos: 'Ítems pasados a otra cuenta',
  mozo_cambiado: 'Cambio de mozo',
  cuenta_pedida: 'Pidió la cuenta',
  precuenta_emitida: 'Precuenta',
};
