'use client';

import { useCallback, useEffect, useMemo, useRef, useTransition, type ReactNode } from 'react';
import { CheckCheck, ChefHat, CloudOff, MessageSquareText, RotateCcw, ShoppingBag, Store, UtensilsCrossed } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CargandoTarjeta } from '@/components/carga';
import { Selector } from '@/components/selector';
import { EstadoVacio, Insignia, TituloSeccion } from '@/components/ui';
import type { Catalogo } from '@/dominio/catalogo';
import { comandaDemorada, reducirCocina, type Comanda, type ItemComanda } from '@/dominio/reductores/cocina';
import { reducirSalon, type EstadoSalon } from '@/dominio/reductores/salon';
import { duracionCorta, minutosDesde, useAhora } from '@/lib/ahora';
import { cn } from '@/lib/cn';
import { hora } from '@/lib/formato';
import { baseLocal, guardarAjuste } from '@/local/base';
import { useConsultaLocal } from '@/local/consulta';
import { useDatosLocales, useOperadorDe } from '@/local/salon';
import { useEstadoSync } from '../motor-sync';
import { nombreMesa, nombreOperador, useRegistrar, type Operador } from '../salon/contexto';
import { useSesion } from '../sesion-cliente';

const TODAS = 'todas';
const MINUTOS_ATENCION = 10;

type Urgencia = 'normal' | 'atencion' | 'demorada';

const BANDA: Record<Urgencia, string> = {
  normal: 'bg-lienzo',
  atencion: 'bg-alerta-tenue',
  demorada: 'bg-error-tenue',
};

const TIEMPO: Record<Urgencia, string> = {
  normal: 'text-tinta',
  atencion: 'text-alerta',
  demorada: 'text-error',
};

/**
 * Un aviso corto cuando entra una comanda. El navegador no deja sonar nada
 * hasta que alguien tocó la pantalla una vez: el primer toque lo habilita.
 */
function useCampana() {
  const contexto = useRef<AudioContext | null>(null);
  useEffect(() => {
    const habilitar = () => {
      contexto.current ??= new AudioContext();
      void contexto.current.resume();
    };
    window.addEventListener('pointerdown', habilitar, { once: true });
    return () => window.removeEventListener('pointerdown', habilitar);
  }, []);
  return useCallback(() => {
    const ctx = contexto.current;
    if (!ctx || ctx.state !== 'running') return;
    const oscilador = ctx.createOscillator();
    const volumen = ctx.createGain();
    oscilador.frequency.value = 880;
    volumen.gain.setValueAtTime(0.2, ctx.currentTime);
    volumen.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    oscilador.connect(volumen).connect(ctx.destination);
    oscilador.start();
    oscilador.stop(ctx.currentTime + 0.6);
  }, []);
}

function urgenciaDe(comanda: Comanda, ahora: number): Urgencia {
  if (comandaDemorada(comanda, ahora)) return 'demorada';
  return minutosDesde(comanda.enviadaEn, ahora) >= MINUTOS_ATENCION ? 'atencion' : 'normal';
}

/** De dónde viene la comanda: la mesa, o el nombre del pedido sin mesa. */
function origenDe(comanda: Comanda, salon: EstadoSalon, catalogo: Catalogo): { titulo: string; icono: ReactNode; mozo: string } {
  const cuenta = salon.cuentas.get(comanda.cuentaId);
  const mozo = nombreOperador(catalogo, cuenta?.mozoId ?? comanda.enviadaPor);
  if (!cuenta) return { titulo: 'Cuenta', icono: <UtensilsCrossed size={16} strokeWidth={1.75} />, mozo };
  if (cuenta.tipo === 'mesa') return { titulo: nombreMesa(catalogo, cuenta.mesaId), icono: <UtensilsCrossed size={16} strokeWidth={1.75} />, mozo };
  if (cuenta.tipo === 'llevar') return { titulo: cuenta.nombre ?? 'Para llevar', icono: <ShoppingBag size={16} strokeWidth={1.75} />, mozo };
  return { titulo: cuenta.nombre ?? 'Mostrador', icono: <Store size={16} strokeWidth={1.75} />, mozo };
}

function FilaItemComanda({ item }: { item: ItemComanda }) {
  return (
    <li className="flex gap-3 border-b border-borde/60 py-2.5 last:border-0">
      <span
        className={cn(
          'grid h-7 min-w-7 shrink-0 place-items-center rounded-md px-1.5 text-sm font-semibold tabular-nums',
          item.anulado ? 'bg-error-tenue text-error' : 'bg-lienzo text-tinta',
        )}
      >
        {item.cantidad}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-base font-medium leading-7', item.anulado ? 'text-tinta-tenue line-through' : 'text-tinta')}>{item.nombre}</p>
        {item.anulado ? <p className="text-xs font-medium text-error">Anulado: no preparar</p> : null}
        {item.modificadores.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.modificadores.map((m) => (
              <span key={m} className="rounded-md bg-lienzo px-1.5 py-0.5 text-xs font-medium text-tinta-suave">
                {m}
              </span>
            ))}
          </div>
        ) : null}
        {item.nota ? (
          <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-alerta-tenue px-2 py-1 text-sm text-alerta">
            <MessageSquareText size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" /> {item.nota}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function TarjetaComanda({
  comanda,
  origen,
  estacion,
  ahora,
  operador,
}: {
  comanda: Comanda;
  origen: { titulo: string; icono: ReactNode; mozo: string };
  /** El nombre de la estación, sólo cuando se están viendo todas. */
  estacion: string | null;
  ahora: number;
  operador: Operador;
}) {
  const registrar = useRegistrar(operador);
  const [ocupado, iniciar] = useTransition();
  const urgencia = urgenciaDe(comanda, ahora);
  const datos = { envioId: comanda.envioId, estacionId: comanda.estacionId };
  const aPreparar = comanda.items.filter((i) => !i.anulado).reduce((s, i) => s + i.cantidad, 0);
  const terminar = () => iniciar(async () => void (await registrar('comanda_lista', comanda.cuentaId, datos)));

  return (
    <article className="tarjeta flex flex-col overflow-hidden">
      <header className={cn('flex items-start justify-between gap-3 px-4 py-3', BANDA[urgencia])}>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-lg font-semibold text-tinta">
            <span className="text-tinta-tenue">{origen.icono}</span>
            <span className="truncate">{origen.titulo}</span>
          </p>
          <p className="truncate text-xs text-tinta-suave">
            {origen.mozo}
            {estacion ? ` · ${estacion}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('text-2xl font-semibold leading-none tabular-nums', TIEMPO[urgencia])}>{duracionCorta(minutosDesde(comanda.enviadaEn, ahora))}</p>
          <p className="mt-1 text-xs tabular-nums text-tinta-tenue">Entró {hora(comanda.enviadaEn)}</p>
        </div>
      </header>

      <ul className="flex-1 px-4 py-1">
        {comanda.items.map((item) => (
          <FilaItemComanda key={item.id} item={item} />
        ))}
      </ul>

      <footer className="flex items-center gap-2 border-t border-borde px-4 py-3">
        <span className="mr-auto text-xs text-tinta-tenue">
          {aPreparar} {aPreparar === 1 ? 'plato' : 'platos'}
        </span>
        <Boton variante="primario" disabled={ocupado} onClick={terminar}>
          <CheckCheck size={15} strokeWidth={1.5} /> Listo
        </Boton>
      </footer>
    </article>
  );
}

function Carril({ titulo, cantidad, vacio, children }: { titulo: string; cantidad: number; vacio: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-tinta-suave">
        {titulo}
        <span className="rounded-md bg-lienzo px-1.5 text-xs tabular-nums text-tinta-tenue">{cantidad}</span>
      </h2>
      {cantidad ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">{children}</div>
      ) : (
        <p className="rounded-xl border border-dashed border-borde px-4 py-6 text-center text-sm text-tinta-tenue">{vacio}</p>
      )}
    </section>
  );
}

export function PantallaCocina() {
  const { usuario } = useSesion();
  const sync = useEstadoSync();
  const ahora = useAhora();
  const datos = useDatosLocales();
  const operadorId = useOperadorDe(datos, usuario.id);
  const estacionGuardada = useConsultaLocal(async () => (await baseLocal.ajustes.get('estacion'))?.valor ?? TODAS, []);
  const campana = useCampana();
  const conocidas = useRef<Set<string> | null>(null);
  const [, iniciar] = useTransition();

  const comandas = useMemo(() => (datos ? reducirCocina(datos.eventos) : new Map<string, Comanda>()), [datos]);
  const salon = useMemo(() => (datos ? reducirSalon(datos.eventos) : null), [datos]);
  const estacion = estacionGuardada ?? TODAS;

  const visibles = [...comandas.values()].filter((c) => estacion === TODAS || c.estacionId === estacion);
  // La más vieja primero: se cocina en el orden en que entró.
  const activas = visibles.filter((c) => c.estado !== 'lista').sort((a, b) => a.enviadaEn.localeCompare(b.enviadaEn));
  const listas = visibles
    .filter((c) => c.estado === 'lista')
    .sort((a, b) => (b.listaEn ?? '').localeCompare(a.listaEn ?? ''))
    .slice(0, 8);

  const claves = activas.map((c) => c.clave).join('|');
  useEffect(() => {
    const actuales = new Set(claves ? claves.split('|') : []);
    // La primera carga no suena: sólo lo que entra mientras la pantalla está abierta.
    if (conocidas.current && [...actuales].some((c) => !conocidas.current!.has(c))) campana();
    conocidas.current = actuales;
  }, [claves, campana]);

  if (!datos?.dispositivoId || !salon) return <CargandoTarjeta />;

  const { catalogo } = datos;
  const operador: Operador = catalogo.operadores.find((o) => o.id === operadorId) ?? { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
  const nombreEstacion = (id: string) => (estacion === TODAS ? (catalogo.estaciones.find((e) => e.id === id)?.nombre ?? null) : null);

  const tarjeta = (c: Comanda) => (
    <TarjetaComanda key={c.clave} comanda={c} origen={origenDe(c, salon, catalogo)} estacion={nombreEstacion(c.estacionId)} ahora={ahora} operador={operador} />
  );

  return (
    <div className="contenido-ancho">
      <TituloSeccion
        accion={
          <div className="w-56">
            <Selector
              opciones={[{ valor: TODAS, etiqueta: 'Todas las estaciones' }, ...catalogo.estaciones.map((e) => ({ valor: e.id, etiqueta: e.nombre }))]}
              valor={estacion}
              alElegir={(valor) => iniciar(async () => guardarAjuste('estacion', valor))}
            />
          </div>
        }
      >
        Cocina
      </TituloSeccion>

      {!sync.enLinea ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Insignia tono="alerta">
            <CloudOff size={12} strokeWidth={2} aria-hidden="true" /> Sin conexión: lo que manden otros dispositivos llega al volver
          </Insignia>
        </div>
      ) : null}

      {activas.length === 0 ? (
        <div className="tarjeta p-5 sm:p-6">
          <EstadoVacio icono={<ChefHat size={28} strokeWidth={1.5} />} titulo="No hay comandas pendientes" />
        </div>
      ) : (
        <Carril titulo="Sin empezar" cantidad={activas.length} vacio="Nada nuevo">
          {activas.map(tarjeta)}
        </Carril>
      )}

      {listas.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-tinta-suave">Últimas listas</h2>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
            {listas.map((c) => (
              <ListaReciente key={c.clave} comanda={c} titulo={origenDe(c, salon, catalogo).titulo} ahora={ahora} operador={operador} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ListaReciente({ comanda, titulo, ahora, operador }: { comanda: Comanda; titulo: string; ahora: number; operador: Operador }) {
  const registrar = useRegistrar(operador);
  const [ocupado, iniciar] = useTransition();
  return (
    <div className="tarjeta flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-tinta">
          {titulo}
          {comanda.listaEn ? <span className="ml-2 text-xs font-normal tabular-nums text-tinta-tenue">hace {duracionCorta(minutosDesde(comanda.listaEn, ahora))}</span> : null}
        </p>
        <p className="truncate text-xs text-tinta-tenue">{comanda.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(', ')}</p>
      </div>
      <Boton
        variante="fantasma"
        tamano="sm"
        disabled={ocupado}
        onClick={() => iniciar(async () => void (await registrar('comanda_reabierta', comanda.cuentaId, { envioId: comanda.envioId, estacionId: comanda.estacionId })))}
      >
        <RotateCcw size={13} strokeWidth={1.5} /> Reabrir
      </Boton>
    </div>
  );
}
