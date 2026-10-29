import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { categorias, dispositivos, elementosPlano, estaciones, motivosAutorizacion, preciosProducto, productos, sectores, usuarios } from '@/db/esquema';
import type { DatosDe, EventoNuevo, TipoEvento } from '@/dominio/eventos';
import type { UsuarioSesion } from '@/lib/sesion';
import { calcularAlertas, tableroDeControl } from './control';
import { recibirEventos } from './sync';

const sufijo = crypto.randomUUID().slice(0, 6);
let dueno: UsuarioSesion;
let mozo: UsuarioSesion;
let encargadoId: string;
let dispositivoId: string;
let mesaId: string;
let producto: { id: string; precioId: string; estacionId: string };
let motivoAnulacion: string;
const cuentaId = crypto.randomUUID();
const itemId = crypto.randomUUID();

function hoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

async function usuario(rol: 'dueno' | 'encargado' | 'mozo', nombre: string): Promise<UsuarioSesion> {
  const [fila] = await db.insert(usuarios).values({ id: crypto.randomUUID(), nombre, email: `${rol}-${sufijo}@ejemplo.com`, rol }).returning();
  return { id: fila!.id, nombre, email: fila!.email, foto: null, rol, esSoporte: false };
}

function evento<T extends TipoEvento>(tipo: T, datos: DatosDe<T>, extra: Partial<EventoNuevo> = {}): EventoNuevo {
  return {
    id: crypto.randomUUID(),
    version: 1,
    tipo,
    dispositivoId,
    operadorId: mozo.id,
    autorizadoPorId: null,
    motivoId: null,
    motivoTexto: null,
    creadoEnDispositivo: new Date().toISOString(),
    agregadoId: cuentaId,
    datos,
    ...extra,
  } as EventoNuevo;
}

beforeAll(async () => {
  dueno = await usuario('dueno', `Dueña ${sufijo}`);
  mozo = await usuario('mozo', `Mozo ${sufijo}`);
  encargadoId = (await usuario('encargado', `Encargada ${sufijo}`)).id;
  dispositivoId = crypto.randomUUID();
  await db.insert(dispositivos).values({ id: dispositivoId, nombre: `Control ${sufijo}` });

  const [sector] = await db.insert(sectores).values({ nombre: `Prueba ${sufijo}` }).returning();
  mesaId = crypto.randomUUID();
  await db.insert(elementosPlano).values({ id: mesaId, sectorId: sector!.id, tipo: 'mesa', x: 0, y: 0, ancho: 80, alto: 80, numeroMesa: 9000 + Math.floor(Math.random() * 999), capacidad: 2 });

  const [estacion] = await db.insert(estaciones).values({ nombre: `Cocina ${sufijo}` }).returning();
  const [categoria] = await db.insert(categorias).values({ nombre: `Platos ${sufijo}` }).returning();
  const [p] = await db.insert(productos).values({ nombre: `Milanesa ${sufijo}`, categoriaId: categoria!.id, estacionId: estacion!.id }).returning();
  const [precio] = await db.insert(preciosProducto).values({ productoId: p!.id, precioCentavos: 1_500_000 }).returning();
  producto = { id: p!.id, precioId: precio!.id, estacionId: estacion!.id };

  const [motivo] = await db.select().from(motivosAutorizacion).where(and(eq(motivosAutorizacion.accion, 'anular_item'), isNull(motivosAutorizacion.archivadoEn))).limit(1);
  motivoAnulacion = motivo!.id;
});

describe('autorizaciones en el servidor', () => {
  it('acepta la cuenta, el ítem y la precuenta sin autorización', async () => {
    const recepciones = await recibirEventos(
      mozo,
      dispositivoId,
      [
        evento('cuenta_abierta', { tipo: 'mesa', mesaId, mozoId: mozo.id, comensales: 2, nombre: null }),
        evento('item_agregado', { itemId, productoId: producto.id, precioId: producto.precioId, nombre: 'Milanesa', precioCentavos: 1_500_000, estacionId: producto.estacionId, cantidad: 1, modificadores: [], nota: null }),
        evento('items_enviados', { envioId: crypto.randomUUID(), itemIds: [itemId] }),
        evento('precuenta_emitida', { precuentaId: crypto.randomUUID(), totalCentavos: 1_500_000 }),
      ],
      null,
    );
    expect(recepciones.map((r) => r.resultado)).toEqual(['aceptado', 'aceptado', 'aceptado', 'aceptado']);
  });

  it('rechaza una anulación sin autorización y una autorizada por un mozo', async () => {
    const [sinAutorizar, autorizadaPorMozo] = await recibirEventos(
      mozo,
      dispositivoId,
      [evento('item_anulado', { itemId }), evento('item_anulado', { itemId }, { autorizadoPorId: mozo.id, motivoId: motivoAnulacion })],
      null,
    );
    expect(sinAutorizar).toMatchObject({ resultado: 'rechazado' });
    expect(sinAutorizar && 'motivo' in sinAutorizar ? sinAutorizar.motivo : '').toContain('Falta autorización');
    expect(autorizadaPorMozo && 'motivo' in autorizadaPorMozo ? autorizadaPorMozo.motivo : '').toBe('Quien autorizó no puede autorizar esta acción');
  });

  it('cargar algo después de la precuenta también la pide', async () => {
    const [carga] = await recibirEventos(
      mozo,
      dispositivoId,
      [evento('item_agregado', { itemId: crypto.randomUUID(), productoId: producto.id, precioId: producto.precioId, nombre: 'Milanesa', precioCentavos: 1_500_000, estacionId: producto.estacionId, cantidad: 1, modificadores: [], nota: null })],
      null,
    );
    expect(carga && 'motivo' in carga ? carga.motivo : '').toContain('después de la precuenta');
  });

  it('acepta la anulación autorizada por la encargada y aparece en el tablero y en las alertas', async () => {
    const [anulacion] = await recibirEventos(mozo, dispositivoId, [evento('item_anulado', { itemId }, { autorizadoPorId: encargadoId, motivoId: motivoAnulacion })], null);
    expect(anulacion).toMatchObject({ resultado: 'aceptado' });

    const tablero = await tableroDeControl(dueno, hoy(), hoy());
    const hecho = tablero.hechos.find((h) => h.cuentaId === cuentaId && h.tipo === 'anulacion')!;
    expect(hecho.montoCentavos).toBe(1_500_000);
    expect(hecho.autorizadoPorId).toBe(encargadoId);
    expect(hecho.trasPrecuenta).toBe(true);
    expect(tablero.rankings.porAutorizante.some((r) => r.id === encargadoId)).toBe(true);

    const alertas = await calcularAlertas(hoy(), hoy());
    expect(alertas.some((a) => a.clave === `${anulacion!.id}:precuenta`)).toBe(true);
  });
});
