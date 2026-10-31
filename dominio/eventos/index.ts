import { z } from 'zod';
import type { Accion } from '../permisos';

/**
 * Toda operación del salón es un evento append-only con id generado en el
 * dispositivo: reenviarlo no duplica nada, y el estado de una mesa o de una
 * caja se deriva de sus eventos. Los eventos son hechos que se suman
 * ("se agregó el ítem X"), nunca estados que se pisan ("la mesa tiene estos
 * ítems"): así dos dispositivos sin red no se pisan.
 *
 * Agregar un tipo es agregarlo a `DEFINICIONES` y a `esquemaEvento`. El
 * esquema de `datos` y la acción que exige viajan juntos para que no haya
 * tipo sin regla.
 */

const id = z.uuid();
const centavos = z.number().int().min(0).max(1_000_000_000);

const modificadorElegido = z.object({
  modificadorId: id,
  nombre: z.string().min(1).max(80),
  precioCentavos: centavos,
});

// El medio viaja con su nombre y si es efectivo: el arqueo de un turno se
// tiene que poder rehacer aunque después se renombre o se archive el medio.
const pago = z.object({
  medioId: id,
  nombre: z.string().min(1).max(40),
  efectivo: z.boolean(),
  montoCentavos: centavos,
});

const DEFINICIONES = {
  operador_cambiado: {
    agregado: 'dispositivo',
    accion: 'operador.cambiar',
    datos: z.object({ operadorAnteriorId: z.string().min(1).nullable() }),
  },
  pin_fallido: {
    agregado: 'dispositivo',
    accion: 'operador.cambiar',
    datos: z.object({ usuarioIntentadoId: z.string().min(1) }),
  },

  cuenta_abierta: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z
      .object({
        tipo: z.enum(['mesa', 'mostrador', 'llevar']),
        mesaId: id.nullable(),
        mozoId: z.string().min(1),
        // 0 es "no se cargó": al abrir ya no se pregunta. Los reportes por
        // comensal dividen sólo cuando hay alguno.
        comensales: z.number().int().min(0).max(99),
        nombre: z.string().trim().max(60).nullable(),
      })
      .refine((d) => (d.tipo === 'mesa') === (d.mesaId !== null), 'Una cuenta de mesa necesita su mesa, y sólo ella'),
  },
  item_agregado: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    // Viaja con nombre, precio y estación tal como estaban en el dispositivo:
    // sin red no hay otra fuente, y lo cobrado tiene que ser lo que se vio.
    datos: z.object({
      itemId: id,
      productoId: id,
      precioId: id,
      nombre: z.string().min(1).max(80),
      precioCentavos: centavos,
      estacionId: id,
      cantidad: z.number().int().min(1).max(99),
      modificadores: z.array(modificadorElegido).max(20),
      nota: z.string().trim().max(140).nullable(),
      // La orden de la que es parte, para mostrar separadas dos órdenes cargadas
      // sin enviar. Los ítems de antes no la traen.
      ordenId: id.optional(),
    }),
  },
  item_quitado: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({ itemId: id }),
  },
  items_enviados: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({ envioId: id, itemIds: z.array(id).min(1).max(200) }),
  },
  cuenta_movida: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({ mesaDestinoId: id }),
  },
  cuentas_unidas: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({ cuentaOrigenId: id }),
  },
  items_transferidos: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({ cuentaDestinoId: id, itemIds: z.array(id).min(1).max(200) }),
  },
  mozo_cambiado: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({ mozoId: z.string().min(1) }),
  },
  cuenta_pedida: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({}),
  },
  // Se marcó por error, o la mesa volvió a pedir algo: la marca se levanta con
  // otro evento, no borrando la anterior.
  cuenta_pedida_cancelada: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({}),
  },
  precuenta_emitida: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({ precuentaId: id, totalCentavos: centavos }),
  },

  // Cocina: el estado de lo que salió en un envío, para una estación. El
  // agregado es la cuenta a la que se envió.
  comanda_iniciada: {
    agregado: 'cuenta',
    accion: 'cocina.operar',
    datos: z.object({ envioId: id, estacionId: id }),
  },
  comanda_lista: {
    agregado: 'cuenta',
    accion: 'cocina.operar',
    datos: z.object({ envioId: id, estacionId: id }),
  },
  comanda_reabierta: {
    agregado: 'cuenta',
    accion: 'cocina.operar',
    datos: z.object({ envioId: id, estacionId: id }),
  },

  turno_abierto: {
    agregado: 'turno',
    accion: 'caja.operar',
    datos: z.object({ fondoCentavos: centavos }),
  },
  salida_caja: {
    agregado: 'turno',
    accion: 'caja.operar',
    datos: z.object({
      salidaId: id,
      tipo: z.enum(['retiro', 'egreso']),
      montoCentavos: centavos.min(1),
      motivo: z.string().trim().min(3, 'Escribí el motivo').max(140),
    }),
  },
  // Arqueo ciego: quien cierra declara lo que contó sin haber visto lo esperado.
  turno_cerrado: {
    agregado: 'turno',
    accion: 'caja.operar',
    datos: z.object({ declarado: z.array(pago).max(20) }),
  },
  cobro_registrado: {
    agregado: 'cuenta',
    accion: 'caja.operar',
    datos: z
      .object({
        cobroId: id,
        turnoId: id,
        division: z.enum(['total', 'partes', 'items']),
        /** Cuánto de la cuenta salda este cobro; la propina va aparte. */
        consumoCentavos: centavos,
        propinaCentavos: centavos,
        itemIds: z.array(id).max(200),
        pagos: z.array(pago).min(1).max(10),
      })
      .refine((d) => d.pagos.reduce((s, p) => s + p.montoCentavos, 0) === d.consumoCentavos + d.propinaCentavos, 'Los pagos no suman lo cobrado'),
  },
  cuenta_cerrada: {
    agregado: 'cuenta',
    accion: 'caja.operar',
    datos: z.object({}),
  },

  // Correcciones sobre una cuenta: ninguna borra nada, y todas piden la
  // autorización de un encargado (dominio/autorizaciones.ts).
  item_anulado: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    // Sin cantidad se anula el ítem entero; con cantidad, sólo esas unidades
    // (bajarle la cantidad a algo ya enviado también es anular).
    datos: z.object({ itemId: id, cantidad: z.number().int().min(1).max(999).optional() }),
  },
  item_cortesia: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    // Como al anular: sin cantidad se regala el ítem entero; con cantidad, sólo esas unidades.
    datos: z.object({ itemId: id, cantidad: z.number().int().min(1).max(999).optional() }),
  },
  precio_modificado: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({ itemId: id, precioCentavos: centavos }),
  },
  descuento_aplicado: {
    agregado: 'cuenta',
    accion: 'salon.operar',
    datos: z.object({
      descuentoId: id,
      /** El porcentaje si se pidió así; el monto es lo que se descuenta. */
      porcentaje: z.number().min(0).max(100).nullable(),
      montoCentavos: centavos.min(1),
    }),
  },
  cuenta_reabierta: {
    agregado: 'cuenta',
    accion: 'caja.operar',
    datos: z.object({}),
  },
  cobro_corregido: {
    agregado: 'cuenta',
    accion: 'caja.operar',
    datos: z.object({ cobroId: id, pagos: z.array(pago).min(1).max(10) }),
  },
} as const satisfies Record<string, { agregado: 'dispositivo' | 'cuenta' | 'turno'; accion: Accion; datos: z.ZodType }>;

export type TipoEvento = keyof typeof DEFINICIONES;
export const TIPOS_EVENTO = Object.keys(DEFINICIONES) as TipoEvento[];

const sobre = z.object({
  id,
  version: z.literal(1),
  dispositivoId: id,
  operadorId: z.string().min(1),
  autorizadoPorId: z.string().min(1).nullable(),
  motivoId: z.string().min(1).nullable(),
  motivoTexto: z.string().trim().max(280).nullable(),
  creadoEnDispositivo: z.iso.datetime({ offset: true }),
  agregadoId: z.string().min(1),
});

function variante<T extends TipoEvento>(tipo: T) {
  return sobre.extend({ tipo: z.literal(tipo), datos: DEFINICIONES[tipo].datos as (typeof DEFINICIONES)[T]['datos'] });
}

export const esquemaEvento = z.discriminatedUnion('tipo', [
  variante('operador_cambiado'),
  variante('pin_fallido'),
  variante('cuenta_abierta'),
  variante('item_agregado'),
  variante('item_quitado'),
  variante('items_enviados'),
  variante('cuenta_movida'),
  variante('cuentas_unidas'),
  variante('items_transferidos'),
  variante('mozo_cambiado'),
  variante('cuenta_pedida'),
  variante('cuenta_pedida_cancelada'),
  variante('precuenta_emitida'),
  variante('comanda_iniciada'),
  variante('comanda_lista'),
  variante('comanda_reabierta'),
  variante('turno_abierto'),
  variante('salida_caja'),
  variante('turno_cerrado'),
  variante('cobro_registrado'),
  variante('cuenta_cerrada'),
  variante('item_anulado'),
  variante('item_cortesia'),
  variante('precio_modificado'),
  variante('descuento_aplicado'),
  variante('cuenta_reabierta'),
  variante('cobro_corregido'),
]);

export type EventoNuevo = z.infer<typeof esquemaEvento>;
export type DatosDe<T extends TipoEvento> = Extract<EventoNuevo, { tipo: T }>['datos'];

/** Un evento tal como lo devuelve el servidor: con su lugar en el orden global. */
export type EventoConfirmado = EventoNuevo & {
  secuencia: number;
  recibidoEn: string;
};

export function definicion(tipo: TipoEvento) {
  return DEFINICIONES[tipo];
}

export const MAX_EVENTOS_POR_ENVIO = 200;
