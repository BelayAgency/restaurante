import type { DatosDe, EventoNuevo } from '../eventos';

/**
 * El estado del salón derivado de sus eventos. Corre igual en el dispositivo
 * y en el servidor. Un evento que no encaja (un ítem de una cuenta que no
 * existe, quitar algo ya enviado) no rompe nada: se ignora y queda anotado en
 * `anomalias`, que es lo que después ve el dueño.
 */

export type EstadoItem = 'borrador' | 'enviado';

export interface Item {
  id: string;
  productoId: string;
  precioId: string;
  nombre: string;
  precioCentavos: number;
  estacionId: string;
  cantidad: number;
  modificadores: DatosDe<'item_agregado'>['modificadores'];
  nota: string | null;
  estado: EstadoItem;
  cargadoPor: string;
  cargadoEn: string;
  enviadoEn: string | null;
  /** Se cargó o se tocó después de una precuenta. */
  trasPrecuenta: boolean;
  /** Anulado con autorización: sigue a la vista, no se cobra. */
  anulado: boolean;
  cortesia: boolean;
  /** El precio de la carta si después se cambió en la cuenta. */
  precioOriginalCentavos: number | null;
}

export interface Precuenta {
  id: string;
  totalCentavos: number;
  emitidaEn: string;
  emitidaPor: string;
}

export interface Cobro {
  id: string;
  turnoId: string;
  consumoCentavos: number;
  propinaCentavos: number;
  pagos: DatosDe<'cobro_registrado'>['pagos'];
  cobradoEn: string;
  cobradoPor: string;
}

export interface Descuento {
  id: string;
  porcentaje: number | null;
  montoCentavos: number;
  aplicadoEn: string;
  aplicadoPor: string;
  autorizadoPor: string | null;
}

export interface Cuenta {
  id: string;
  tipo: DatosDe<'cuenta_abierta'>['tipo'];
  mesaId: string | null;
  mozoId: string;
  comensales: number;
  nombre: string | null;
  abiertaEn: string;
  abiertaPor: string;
  /** `unida`: sus ítems pasaron a otra cuenta y ya no se opera. `cerrada`: se cobró y liberó la mesa. */
  estado: 'abierta' | 'unida' | 'cerrada';
  cerradaEn: string | null;
  cobros: Cobro[];
  /** Lo saldado del consumo, sin propinas. */
  pagadoCentavos: number;
  /** Ítems ya cobrados cuando se divide por ítem. */
  itemsPagados: Set<string>;
  items: Map<string, Item>;
  pidioCuenta: boolean;
  precuentas: Precuenta[];
  cambiosTrasPrecuenta: number;
  descuentos: Descuento[];
}

export interface Anomalia {
  eventoId: string;
  tipo: EventoNuevo['tipo'];
  momento: string;
  operadorId: string;
  detalle: string;
}

export interface EstadoSalon {
  cuentas: Map<string, Cuenta>;
  anomalias: Anomalia[];
}

export function importeItem(item: Pick<Item, 'precioCentavos' | 'cantidad' | 'modificadores'> & Partial<Pick<Item, 'anulado' | 'cortesia'>>): number {
  if (item.anulado || item.cortesia) return 0;
  const unitario = item.precioCentavos + item.modificadores.reduce((suma, m) => suma + m.precioCentavos, 0);
  return unitario * item.cantidad;
}

export function totalCuenta(cuenta: Cuenta): number {
  let total = 0;
  for (const item of cuenta.items.values()) total += importeItem(item);
  const descuentos = cuenta.descuentos.reduce((s, d) => s + d.montoCentavos, 0);
  return Math.max(0, total - descuentos);
}

function marcarSiHayPrecuenta(cuenta: Cuenta) {
  if (cuenta.precuentas.length > 0) cuenta.cambiosTrasPrecuenta += 1;
}

export function reducirSalon(eventos: Iterable<EventoNuevo>): EstadoSalon {
  const cuentas = new Map<string, Cuenta>();
  const anomalias: Anomalia[] = [];
  const anotar = (evento: EventoNuevo, detalle: string) =>
    anomalias.push({ eventoId: evento.id, tipo: evento.tipo, momento: evento.creadoEnDispositivo, operadorId: evento.operadorId, detalle });

  for (const evento of eventos) {
    // Lo de dispositivo, cocina y turnos de caja lo reducen sus propios reductores.
    if (
      evento.tipo === 'operador_cambiado' ||
      evento.tipo === 'pin_fallido' ||
      evento.tipo.startsWith('comanda_') ||
      evento.tipo === 'turno_abierto' ||
      evento.tipo === 'salida_caja' ||
      evento.tipo === 'turno_cerrado'
    )
      continue;

    if (evento.tipo === 'cuenta_abierta') {
      if (cuentas.has(evento.agregadoId)) continue;
      const { tipo, mesaId, mozoId, comensales, nombre } = evento.datos;
      cuentas.set(evento.agregadoId, {
        id: evento.agregadoId,
        tipo,
        mesaId,
        mozoId,
        comensales,
        nombre,
        abiertaEn: evento.creadoEnDispositivo,
        abiertaPor: evento.operadorId,
        estado: 'abierta',
        items: new Map(),
        pidioCuenta: false,
        precuentas: [],
        cambiosTrasPrecuenta: 0,
        cerradaEn: null,
        cobros: [],
        pagadoCentavos: 0,
        itemsPagados: new Set(),
        descuentos: [],
      });
      continue;
    }

    const cuenta = cuentas.get(evento.agregadoId);
    if (!cuenta) {
      anotar(evento, 'La cuenta no existe');
      continue;
    }
    // Reabrir y corregir un cobro son justamente lo que se hace con una cuenta cerrada.
    if (cuenta.estado !== 'abierta' && !(cuenta.estado === 'cerrada' && (evento.tipo === 'cuenta_reabierta' || evento.tipo === 'cobro_corregido'))) {
      anotar(evento, cuenta.estado === 'cerrada' ? 'La cuenta ya estaba cerrada' : 'La cuenta ya se había unido a otra');
      continue;
    }

    switch (evento.tipo) {
      case 'item_agregado': {
        const d = evento.datos;
        if (cuenta.items.has(d.itemId)) break;
        cuenta.items.set(d.itemId, {
          id: d.itemId,
          productoId: d.productoId,
          precioId: d.precioId,
          nombre: d.nombre,
          precioCentavos: d.precioCentavos,
          estacionId: d.estacionId,
          cantidad: d.cantidad,
          modificadores: d.modificadores,
          nota: d.nota,
          estado: 'borrador',
          cargadoPor: evento.operadorId,
          cargadoEn: evento.creadoEnDispositivo,
          enviadoEn: null,
          trasPrecuenta: cuenta.precuentas.length > 0,
          anulado: false,
          cortesia: false,
          precioOriginalCentavos: null,
        });
        cuenta.pidioCuenta = false;
        marcarSiHayPrecuenta(cuenta);
        break;
      }
      case 'item_quitado': {
        const item = cuenta.items.get(evento.datos.itemId);
        if (!item) break;
        // Lo enviado no se borra: se anula, con autorización.
        if (item.estado === 'enviado') {
          anotar(evento, `Se intentó quitar «${item.nombre}» después de enviarlo a cocina`);
          break;
        }
        cuenta.items.delete(item.id);
        marcarSiHayPrecuenta(cuenta);
        break;
      }
      case 'items_enviados':
        for (const itemId of evento.datos.itemIds) {
          const item = cuenta.items.get(itemId);
          if (item?.estado === 'borrador') {
            item.estado = 'enviado';
            item.enviadoEn = evento.creadoEnDispositivo;
          }
        }
        break;
      case 'cuenta_movida':
        cuenta.mesaId = evento.datos.mesaDestinoId;
        if (cuenta.tipo !== 'mesa') cuenta.tipo = 'mesa';
        break;
      case 'cuentas_unidas': {
        const origen = cuentas.get(evento.datos.cuentaOrigenId);
        if (!origen || origen.estado !== 'abierta' || origen.id === cuenta.id) {
          anotar(evento, 'La cuenta a unir no está abierta');
          break;
        }
        for (const item of origen.items.values()) cuenta.items.set(item.id, item);
        cuenta.comensales += origen.comensales;
        origen.items = new Map();
        origen.estado = 'unida';
        marcarSiHayPrecuenta(cuenta);
        break;
      }
      case 'items_transferidos': {
        const destino = cuentas.get(evento.datos.cuentaDestinoId);
        if (!destino || destino.estado !== 'abierta' || destino.id === cuenta.id) {
          anotar(evento, 'La cuenta de destino no está abierta');
          break;
        }
        for (const itemId of evento.datos.itemIds) {
          const item = cuenta.items.get(itemId);
          if (!item) continue;
          cuenta.items.delete(itemId);
          destino.items.set(itemId, item);
        }
        marcarSiHayPrecuenta(cuenta);
        marcarSiHayPrecuenta(destino);
        break;
      }
      case 'mozo_cambiado':
        cuenta.mozoId = evento.datos.mozoId;
        break;
      case 'cuenta_pedida':
        cuenta.pidioCuenta = true;
        break;
      case 'cobro_registrado': {
        const d = evento.datos;
        if (cuenta.cobros.some((c) => c.id === d.cobroId)) break;
        cuenta.cobros.push({
          id: d.cobroId,
          turnoId: d.turnoId,
          consumoCentavos: d.consumoCentavos,
          propinaCentavos: d.propinaCentavos,
          pagos: d.pagos,
          cobradoEn: evento.creadoEnDispositivo,
          cobradoPor: evento.operadorId,
        });
        cuenta.pagadoCentavos += d.consumoCentavos;
        for (const itemId of d.itemIds) cuenta.itemsPagados.add(itemId);
        if (cuenta.pagadoCentavos > totalCuenta(cuenta)) anotar(evento, 'Se cobró más de lo que suma la cuenta');
        break;
      }
      case 'cuenta_cerrada': {
        const saldo = totalCuenta(cuenta) - cuenta.pagadoCentavos;
        // Cerrar sin cobrar exige autorización; si llega así, queda a la vista.
        if (saldo !== 0) anotar(evento, `Se cerró con un saldo de ${saldo} centavos`);
        cuenta.estado = 'cerrada';
        cuenta.cerradaEn = evento.creadoEnDispositivo;
        break;
      }
      case 'item_anulado':
      case 'item_cortesia':
      case 'precio_modificado': {
        const item = cuenta.items.get(evento.datos.itemId);
        if (!item) {
          anotar(evento, 'El ítem no está en la cuenta');
          break;
        }
        if (evento.tipo === 'item_anulado') item.anulado = true;
        else if (evento.tipo === 'item_cortesia') item.cortesia = true;
        else {
          item.precioOriginalCentavos ??= item.precioCentavos;
          item.precioCentavos = evento.datos.precioCentavos;
        }
        marcarSiHayPrecuenta(cuenta);
        break;
      }
      case 'descuento_aplicado':
        if (cuenta.descuentos.some((d) => d.id === evento.datos.descuentoId)) break;
        cuenta.descuentos.push({
          id: evento.datos.descuentoId,
          porcentaje: evento.datos.porcentaje,
          montoCentavos: evento.datos.montoCentavos,
          aplicadoEn: evento.creadoEnDispositivo,
          aplicadoPor: evento.operadorId,
          autorizadoPor: evento.autorizadoPorId,
        });
        marcarSiHayPrecuenta(cuenta);
        break;
      case 'cuenta_reabierta':
        if (cuenta.estado === 'cerrada') {
          cuenta.estado = 'abierta';
          cuenta.cerradaEn = null;
        }
        break;
      case 'cobro_corregido': {
        const cobro = cuenta.cobros.find((c) => c.id === evento.datos.cobroId);
        const suma = evento.datos.pagos.reduce((s, p) => s + p.montoCentavos, 0);
        if (!cobro || suma !== cobro.consumoCentavos + cobro.propinaCentavos) {
          anotar(evento, 'La corrección no coincide con el cobro');
          break;
        }
        cobro.pagos = evento.datos.pagos;
        break;
      }
      case 'precuenta_emitida':
        cuenta.precuentas.push({
          id: evento.datos.precuentaId,
          totalCentavos: evento.datos.totalCentavos,
          emitidaEn: evento.creadoEnDispositivo,
          emitidaPor: evento.operadorId,
        });
        cuenta.cambiosTrasPrecuenta = 0;
        for (const item of cuenta.items.values()) item.trasPrecuenta = false;
        break;
    }
  }

  return { cuentas, anomalias };
}

export type EstadoMesa = 'libre' | 'ocupada' | 'pidio_cuenta' | 'precuenta';

export interface VistaMesa {
  estado: EstadoMesa;
  cuentas: Cuenta[];
}

/**
 * Lo que muestra el plano para cada mesa. Dos cuentas en la misma mesa no se
 * esconden: pasa cuando dos mozos la abren sin red, y hay que verlo para
 * unirlas.
 */
export function vistaDeMesas(estado: EstadoSalon): Map<string, VistaMesa> {
  const porMesa = new Map<string, VistaMesa>();
  for (const cuenta of estado.cuentas.values()) {
    if (cuenta.estado !== 'abierta' || !cuenta.mesaId) continue;
    const vista = porMesa.get(cuenta.mesaId) ?? { estado: 'ocupada' as EstadoMesa, cuentas: [] };
    vista.cuentas.push(cuenta);
    porMesa.set(cuenta.mesaId, vista);
  }
  for (const vista of porMesa.values()) {
    const ultimaPrecuentaVigente = vista.cuentas.some((c) => c.precuentas.length > 0 && c.cambiosTrasPrecuenta === 0);
    if (ultimaPrecuentaVigente) vista.estado = 'precuenta';
    else if (vista.cuentas.some((c) => c.pidioCuenta)) vista.estado = 'pidio_cuenta';
  }
  return porMesa;
}

export function saldoCuenta(cuenta: Cuenta): number {
  return totalCuenta(cuenta) - cuenta.pagadoCentavos;
}

export function cuentasAbiertas(estado: EstadoSalon): Cuenta[] {
  return [...estado.cuentas.values()].filter((c) => c.estado === 'abierta');
}
