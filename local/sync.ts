import { definicion, esquemaEvento, type EventoConfirmado, type EventoNuevo, MAX_EVENTOS_POR_ENVIO } from '@/dominio/eventos';
import { puede } from '@/dominio/permisos';
import type { Catalogo } from '@/dominio/catalogo';
import type { Rol } from '@/dominio/roles';
import { baseLocal, guardarAjuste, leerAjuste } from './base';

/**
 * El motor de sincronización del dispositivo. Escribir es siempre local: el
 * evento entra a la bandeja y se ve al instante. Mandar y traer pasa por
 * detrás, cuando hay red, y el orden global lo pone el servidor.
 */

export type ProblemaSync = 'sesion' | 'dispositivo' | 'suspendido' | null;

export interface EstadoSync {
  enLinea: boolean;
  sincronizando: boolean;
  problema: ProblemaSync;
  ultimoContacto: string | null;
}

const INTERVALO_MS = 15_000;

let estado: EstadoSync = { enLinea: true, sincronizando: false, problema: null, ultimoContacto: null };
const suscriptores = new Set<() => void>();
let arrancado = false;
let enCurso: Promise<void> | null = null;
let fuenteVivo: EventSource | null = null;

function actualizar(cambios: Partial<EstadoSync>) {
  estado = { ...estado, ...cambios };
  for (const s of suscriptores) s();
}

export function suscribirSync(fn: () => void) {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

export function estadoSync(): EstadoSync {
  return estado;
}

const ESTADO_SERVIDOR: EstadoSync = { enLinea: true, sincronizando: false, problema: null, ultimoContacto: null };
export function estadoSyncServidor(): EstadoSync {
  return ESTADO_SERVIDOR;
}

function problemaDe(status: number): ProblemaSync {
  if (status === 401) return 'sesion';
  if (status === 403) return 'dispositivo';
  if (status === 423) return 'suspendido';
  return null;
}

async function enviar(dispositivoId: string) {
  for (;;) {
    const lote = await baseLocal.pendientes.orderBy('orden').limit(MAX_EVENTOS_POR_ENVIO).toArray();
    if (lote.length === 0) return;

    const respuesta = await fetch('/api/sync/eventos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dispositivoId, horaDispositivo: new Date().toISOString(), eventos: lote.map((p) => p.evento) }),
    });
    if (!respuesta.ok) {
      const problema = problemaDe(respuesta.status);
      if (problema) actualizar({ problema });
      await baseLocal.pendientes.bulkUpdate(lote.map((p) => ({ key: p.id, changes: { intentos: p.intentos + 1, ultimoError: `HTTP ${respuesta.status}` } })));
      return;
    }

    const { recepciones, invalidos } = (await respuesta.json()) as {
      recepciones: ({ id: string; secuencia: number } & ({ resultado: 'aceptado' } | { resultado: 'rechazado'; motivo: string }))[];
      invalidos: string[];
    };
    const porId = new Map(lote.map((p) => [p.id, p]));
    const ahora = new Date().toISOString();

    await baseLocal.transaction('rw', baseLocal.pendientes, baseLocal.confirmados, baseLocal.rechazados, async () => {
      for (const r of recepciones) {
        const pendiente = porId.get(r.id);
        if (!pendiente) continue;
        if (r.resultado === 'aceptado') {
          await baseLocal.confirmados.put({ ...pendiente.evento, secuencia: r.secuencia, recibidoEn: ahora } as EventoConfirmado);
        } else {
          await baseLocal.rechazados.put({ id: r.id, evento: pendiente.evento, motivo: r.motivo, rechazadoEn: ahora });
        }
        await baseLocal.pendientes.delete(r.id);
      }
      for (const id of invalidos) {
        const pendiente = porId.get(id);
        if (!pendiente) continue;
        await baseLocal.rechazados.put({ id, evento: pendiente.evento, motivo: 'El servidor no reconoce este evento', rechazadoEn: ahora });
        await baseLocal.pendientes.delete(id);
      }
    });
    if (lote.length < MAX_EVENTOS_POR_ENVIO) return;
  }
}

async function traer(dispositivoId: string) {
  for (;;) {
    const cursor = Number((await leerAjuste('cursor')) ?? 0);
    const respuesta = await fetch(`/api/sync/eventos?dispositivo=${dispositivoId}&desde=${cursor}`, { cache: 'no-store' });
    if (!respuesta.ok) {
      const problema = problemaDe(respuesta.status);
      if (problema) actualizar({ problema });
      return;
    }
    const { eventos, hayMas } = (await respuesta.json()) as { eventos: EventoConfirmado[]; hayMas: boolean };
    if (eventos.length > 0) {
      await baseLocal.transaction('rw', baseLocal.confirmados, baseLocal.ajustes, async () => {
        await baseLocal.confirmados.bulkPut(eventos);
        await guardarAjuste('cursor', String(eventos.at(-1)!.secuencia));
      });
    }
    if (!hayMas) return;
  }
}

async function traerCatalogo(dispositivoId: string) {
  const respuesta = await fetch(`/api/sync/catalogo?dispositivo=${dispositivoId}`, { cache: 'no-store' });
  if (!respuesta.ok) return;
  const catalogo = (await respuesta.json()) as Catalogo;
  await baseLocal.transaction('rw', baseLocal.operadores, baseLocal.catalogo, async () => {
    await baseLocal.operadores.clear();
    await baseLocal.operadores.bulkPut(catalogo.operadores);
    await baseLocal.catalogo.put({ clave: 'actual', valor: catalogo, actualizadoEn: new Date().toISOString() });
  });
}

/** Un ciclo completo: mandar lo propio, traer lo ajeno, refrescar el catálogo. Nunca dos a la vez. */
export function sincronizar(): Promise<void> {
  enCurso ??= (async () => {
    const dispositivoId = await leerAjuste('dispositivo');
    if (!dispositivoId || !navigator.onLine) {
      actualizar({ enLinea: navigator.onLine });
      return;
    }
    actualizar({ sincronizando: true });
    try {
      await enviar(dispositivoId);
      await traer(dispositivoId);
      await traerCatalogo(dispositivoId);
      const contacto = new Date().toISOString();
      await guardarAjuste('contacto', contacto);
      actualizar({ enLinea: true, ultimoContacto: contacto, problema: estado.problema === 'suspendido' ? null : estado.problema });
    } catch {
      // Sin red a mitad de camino: queda todo en la bandeja para el próximo ciclo.
      actualizar({ enLinea: false });
    } finally {
      actualizar({ sincronizando: false });
      enCurso = null;
    }
  })();
  return enCurso;
}

function abrirVivo() {
  fuenteVivo?.close();
  fuenteVivo = new EventSource('/api/sync/vivo');
  fuenteVivo.addEventListener('secuencia', async (aviso) => {
    const cursor = Number((await leerAjuste('cursor')) ?? 0);
    if (Number((aviso as MessageEvent<string>).data) > cursor) void sincronizar();
  });
}

/** Se llama una vez por pestaña. Lo demás lo hacen los timers y los eventos de red. */
export async function arrancarSync() {
  if (arrancado) return;
  arrancado = true;
  actualizar({ enLinea: navigator.onLine, ultimoContacto: await leerAjuste('contacto') });
  window.addEventListener('online', () => {
    actualizar({ enLinea: true });
    abrirVivo();
    void sincronizar();
  });
  window.addEventListener('offline', () => actualizar({ enLinea: false }));
  setInterval(() => void sincronizar(), INTERVALO_MS);
  abrirVivo();
  await sincronizar();
}

export class EventoNoPermitido extends Error {}

/**
 * Registra un evento del operador activo. Aplica la misma regla de permisos
 * que el servidor: sin red, es la única que hay; con red, el servidor la
 * vuelve a aplicar al recibirlo.
 */
export async function registrarEvento<T extends EventoNuevo['tipo']>(
  tipo: T,
  agregadoId: string,
  datos: Extract<EventoNuevo, { tipo: T }>['datos'],
  operador: { id: string; rol: Rol },
  autorizacion?: { autorizadoPorId: string; motivoId: string; motivoTexto: string | null },
) {
  const dispositivoId = await leerAjuste('dispositivo');
  if (!dispositivoId) throw new EventoNoPermitido('Este dispositivo no está registrado');
  if (!puede(operador, definicion(tipo).accion)) throw new EventoNoPermitido('No tenés permiso para esto');

  const evento = esquemaEvento.parse({
    id: crypto.randomUUID(),
    version: 1,
    tipo,
    dispositivoId,
    operadorId: operador.id,
    autorizadoPorId: autorizacion?.autorizadoPorId ?? null,
    motivoId: autorizacion?.motivoId ?? null,
    motivoTexto: autorizacion?.motivoTexto ?? null,
    creadoEnDispositivo: new Date().toISOString(),
    agregadoId,
    datos,
  });

  const ultimo = await baseLocal.pendientes.orderBy('orden').last();
  await baseLocal.pendientes.add({ id: evento.id, orden: (ultimo?.orden ?? 0) + 1, evento, intentos: 0, ultimoError: null });
  void sincronizar();
  return evento;
}
