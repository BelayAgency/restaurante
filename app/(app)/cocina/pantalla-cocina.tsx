'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useTransition } from 'react';
import { BellRing, CheckCheck, ChefHat, CloudOff, RotateCcw, Tablet } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CargandoTarjeta } from '@/components/carga';
import { Selector } from '@/components/selector';
import { EstadoVacio, Insignia, Tarjeta, TituloSeccion } from '@/components/ui';
import { comandaDemorada, reducirCocina, type Comanda } from '@/dominio/reductores/cocina';
import { reducirSalon } from '@/dominio/reductores/salon';
import { duracionCorta, minutosDesde, useAhora } from '@/lib/ahora';
import { cn } from '@/lib/cn';
import { baseLocal, guardarAjuste } from '@/local/base';
import { useConsultaLocal } from '@/local/consulta';
import { useDatosLocales, useOperadorDe } from '@/local/salon';
import { useEstadoSync } from '../motor-sync';
import { nombreMesa, nombreOperador, useRegistrar, type Operador } from '../salon/contexto';
import { useSesion } from '../sesion-cliente';

const TODAS = 'todas';
const MINUTOS_ATENCION = 10;

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

function TarjetaComanda({
  comanda,
  titulo,
  mozo,
  ahora,
  operador,
}: {
  comanda: Comanda;
  titulo: string;
  mozo: string;
  ahora: number;
  operador: Operador;
}) {
  const registrar = useRegistrar(operador);
  const [ocupado, iniciar] = useTransition();
  const minutos = minutosDesde(comanda.enviadaEn, ahora);
  const demorada = comandaDemorada(comanda, ahora);
  const datos = { envioId: comanda.envioId, estacionId: comanda.estacionId };

  return (
    <Tarjeta
      padding={false}
      className={cn('flex flex-col p-4', demorada ? 'ring-2 ring-error' : minutos >= MINUTOS_ATENCION ? 'ring-2 ring-alerta' : undefined)}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold text-tinta">{titulo}</p>
          <p className="text-xs text-tinta-tenue">{mozo}</p>
        </div>
        <div className="text-right">
          <p className={cn('text-lg font-semibold tabular-nums', demorada ? 'text-error' : minutos >= MINUTOS_ATENCION ? 'text-alerta' : 'text-tinta')}>
            {duracionCorta(minutos)}
          </p>
          {comanda.estado === 'en_preparacion' ? <Insignia tono="acento">En preparación</Insignia> : null}
        </div>
      </div>
      <ul className="mb-4 flex-1">
        {comanda.items.map((item) => (
          <li key={item.id} className="border-b border-borde/60 py-2 last:border-0">
            {item.anulado ? <Insignia tono="error">Anulado: no preparar</Insignia> : null}
            <p className={item.anulado ? 'text-base text-tinta-tenue line-through' : 'text-base text-tinta'}>
              <span className="font-semibold tabular-nums">{item.cantidad} ×</span> {item.nombre}
            </p>
            {item.modificadores.length ? <p className="text-sm font-medium text-tinta-suave">{item.modificadores.join(' · ')}</p> : null}
            {item.nota ? <p className="text-sm italic text-alerta">«{item.nota}»</p> : null}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Boton
          variante="secundario"
          tamano="lg"
          disabled={ocupado || comanda.estado !== 'pendiente'}
          onClick={() => iniciar(async () => void (await registrar('comanda_iniciada', comanda.cuentaId, datos)))}
        >
          <ChefHat size={16} strokeWidth={1.5} /> Empezar
        </Boton>
        <Boton variante="primario" tamano="lg" disabled={ocupado} onClick={() => iniciar(async () => void (await registrar('comanda_lista', comanda.cuentaId, datos)))}>
          <CheckCheck size={16} strokeWidth={1.5} /> Listo
        </Boton>
      </div>
    </Tarjeta>
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

  if (!datos || !salon) return <CargandoTarjeta />;
  if (!datos.dispositivoId) {
    return (
      <Tarjeta>
        <EstadoVacio
          icono={<Tablet size={28} strokeWidth={1.5} />}
          titulo="Este dispositivo no está registrado"
          accion={
            <Link href="/dispositivo" className="text-sm font-medium text-acento hover:underline">
              Ir a Este dispositivo
            </Link>
          }
        />
      </Tarjeta>
    );
  }

  const { catalogo } = datos;
  const operador: Operador = catalogo.operadores.find((o) => o.id === operadorId) ?? { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };

  function tituloDe(comanda: Comanda) {
    const cuenta = salon!.cuentas.get(comanda.cuentaId);
    if (!cuenta) return 'Cuenta';
    if (cuenta.tipo === 'mesa') return nombreMesa(catalogo, cuenta.mesaId);
    return cuenta.nombre ?? (cuenta.tipo === 'llevar' ? 'Para llevar' : 'Mostrador');
  }

  return (
    <>
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

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
        <span className="inline-flex items-center gap-1">
          <BellRing size={14} strokeWidth={1.5} /> Tocá la pantalla una vez para que suene cuando entra una comanda.
        </span>
        {!sync.enLinea ? (
          <Insignia tono="alerta">
            <CloudOff size={12} strokeWidth={2} aria-hidden="true" /> Sin conexión: lo que manden otros dispositivos llega al volver
          </Insignia>
        ) : null}
      </div>

      {activas.length === 0 ? (
        <Tarjeta>
          <EstadoVacio icono={<ChefHat size={28} strokeWidth={1.5} />} titulo="No hay comandas pendientes" />
        </Tarjeta>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {activas.map((c) => {
            const cuenta = salon.cuentas.get(c.cuentaId);
            return (
              <TarjetaComanda
                key={c.clave}
                comanda={c}
                titulo={tituloDe(c)}
                mozo={cuenta ? nombreOperador(catalogo, cuenta.mozoId) : nombreOperador(catalogo, c.enviadaPor)}
                ahora={ahora}
                operador={operador}
              />
            );
          })}
        </div>
      )}

      {listas.length ? (
        <section className="mt-8">
          <TituloSeccion>Últimas listas</TituloSeccion>
          <div className="flex flex-col gap-2">
            {listas.map((c) => (
              <ListaReciente key={c.clave} comanda={c} titulo={tituloDe(c)} operador={operador} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function ListaReciente({ comanda, titulo, operador }: { comanda: Comanda; titulo: string; operador: Operador }) {
  const registrar = useRegistrar(operador);
  const [ocupado, iniciar] = useTransition();
  return (
    <Tarjeta padding={false} className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-tinta">{titulo}</p>
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
    </Tarjeta>
  );
}
