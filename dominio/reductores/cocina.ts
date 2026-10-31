import type { DatosDe, EventoNuevo } from '../eventos';

/**
 * Lo que ve cocina, derivado de los mismos eventos que el salón. Cada envío
 * se parte por estación: el bife va a la parrilla y el vino a la barra, y cada
 * una marca lo suyo. En cocina no se prepara nada que no haya entrado así.
 */

export const MINUTOS_DEMORA = 20;

export type EstadoComanda = 'pendiente' | 'lista';

export interface ItemComanda {
  id: string;
  nombre: string;
  cantidad: number;
  modificadores: string[];
  nota: string | null;
  /** Se anuló después de enviarlo: cocina lo ve tachado, no desaparece. */
  anulado: boolean;
}

export interface Comanda {
  clave: string;
  envioId: string;
  estacionId: string;
  cuentaId: string;
  enviadaEn: string;
  enviadaPor: string;
  items: ItemComanda[];
  estado: EstadoComanda;
  listaEn: string | null;
}

export function claveComanda(envioId: string, estacionId: string): string {
  return `${envioId}:${estacionId}`;
}

type DatosItem = DatosDe<'item_agregado'>;

export function reducirCocina(eventos: Iterable<EventoNuevo>): Map<string, Comanda> {
  const items = new Map<string, DatosItem>();
  const comandas = new Map<string, Comanda>();

  for (const evento of eventos) {
    switch (evento.tipo) {
      case 'item_agregado':
        if (!items.has(evento.datos.itemId)) items.set(evento.datos.itemId, evento.datos);
        break;
      case 'item_quitado':
        // Sólo se puede quitar lo que no se envió: no llega a ninguna comanda.
        items.delete(evento.datos.itemId);
        break;
      case 'items_enviados':
        for (const itemId of evento.datos.itemIds) {
          const item = items.get(itemId);
          if (!item) continue;
          const clave = claveComanda(evento.datos.envioId, item.estacionId);
          let comanda = comandas.get(clave);
          if (!comanda) {
            comanda = {
              clave,
              envioId: evento.datos.envioId,
              estacionId: item.estacionId,
              cuentaId: evento.agregadoId,
              enviadaEn: evento.creadoEnDispositivo,
              enviadaPor: evento.operadorId,
              items: [],
              estado: 'pendiente',
              listaEn: null,
            };
            comandas.set(clave, comanda);
          }
          if (comanda.items.some((i) => i.id === itemId)) continue;
          comanda.items.push({
            id: itemId,
            nombre: item.nombre,
            cantidad: item.cantidad,
            modificadores: item.modificadores.map((m) => m.nombre),
            nota: item.nota,
            anulado: false,
          });
        }
        break;
      case 'item_anulado':
        for (const comanda of comandas.values()) {
          const posicion = comanda.items.findIndex((i) => i.id === evento.datos.itemId);
          if (posicion < 0) continue;
          const item = comanda.items[posicion]!;
          const cantidad = evento.datos.cantidad;
          if (cantidad === undefined || cantidad >= item.cantidad) item.anulado = true;
          else {
            // Bajaron la cantidad: cocina ve las unidades de menos tachadas al lado.
            item.cantidad -= cantidad;
            comanda.items.splice(posicion + 1, 0, { ...item, id: `${item.id}~${evento.id}`, cantidad, anulado: true });
          }
        }
        break;
      // `comanda_iniciada` ya no se registra (la comanda está sin empezar o
      // lista), pero puede haber viejos en el historial: no cambian nada.
      case 'comanda_lista':
      case 'comanda_reabierta': {
        const comanda = comandas.get(claveComanda(evento.datos.envioId, evento.datos.estacionId));
        if (!comanda) break;
        if (evento.tipo === 'comanda_lista') {
          comanda.estado = 'lista';
          comanda.listaEn = evento.creadoEnDispositivo;
        } else if (comanda.estado === 'lista') {
          comanda.estado = 'pendiente';
          comanda.listaEn = null;
        }
        break;
      }
    }
  }
  return comandas;
}

export function comandaDemorada(comanda: Comanda, ahora: number): boolean {
  return comanda.estado !== 'lista' && ahora - new Date(comanda.enviadaEn).getTime() > MINUTOS_DEMORA * 60_000;
}

/** Los ítems que ya salieron de cocina, para que el mozo los vea listos. */
export function itemsListos(comandas: Map<string, Comanda>): Set<string> {
  const listos = new Set<string>();
  for (const c of comandas.values()) if (c.estado === 'lista') for (const i of c.items) listos.add(i.id);
  return listos;
}
