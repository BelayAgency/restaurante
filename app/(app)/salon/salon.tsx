'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, CircleDollarSign, CloudOff, Layers, LayoutGrid, MoveRight, PencilRuler, ShoppingBag, Store } from 'lucide-react';
import { Boton } from '@/components/boton';
import { useToast } from '@/components/toast';
import { CargandoTarjeta } from '@/components/carga';
import { Modal } from '@/components/modal';
import type { Margenes, MarcaMesa } from '@/components/plano/lienzo-plano';
import { LienzoPlanoDinamico } from '@/components/plano/lienzo-plano-dinamico';
import { Aviso, EstadoVacio, Insignia } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { turnoAbierto, reducirCaja } from '@/dominio/reductores/caja';
import { itemsListos, reducirCocina } from '@/dominio/reductores/cocina';
import { cuentasAbiertas, totalCuenta, vistaDeMesas, type Cuenta } from '@/dominio/reductores/salon';
import { cn } from '@/lib/cn';
import { pesosDesdeCentavos } from '@/lib/formato';
import { usePanelAlCostado, usePantallaAncha } from '@/lib/pantalla-ancha';
import { useDatosLocales, useEstadoSalon, useOperadorDe } from '@/local/salon';
import { useEstadoSync } from '../motor-sync';
import { useSesion } from '../sesion-cliente';
import { nombreCuenta, nombreMesa, nombreOperador, useRegistrar, type Operador } from './contexto';
import { EditorPlano } from './editor-plano';
import { ModalAbrirCuenta, type TipoCuenta } from './modal-abrir-cuenta';
import type { ReservaDelDia } from '@/servidor/reservas';
import { CartelAbrirCaja } from './cartel-abrir-caja';
import { FilaCuentaSinMesa, ModalParaLlevar } from './cuentas-sin-mesa';
import { PanelCuenta } from './panel-cuenta';
import { ModalReservasHoy } from './reservas-hoy';
import { ModalCaja } from '../caja/modal-caja';

/** Más chicos que el `sm` del sistema: flotan sobre el plano y no deben taparlo. */
const BOTON_BARRA = 'h-10 gap-2 px-3.5 text-[15px]';

/** Apagado por ahora: se opera sólo el primer sector (el salón) aunque haya más armados. */
const ALTERNAR_SECTORES = false;

/**
 * El inicio: el plano del local a pantalla completa, con el estado de cada
 * mesa. Todo sale de la base del dispositivo, así que se sigue operando sin
 * red. Por eso el panel de la cuenta se abre con estado local y no con la URL:
 * cambiar la URL le pide la página al servidor, y sin red eso no vuelve. El
 * dueño edita el plano acá mismo, con el botón de edición.
 */
export function Salon({ reservasHoy }: { reservasHoy: ReservaDelDia[] }) {
  const { usuario, vista } = useSesion();
  const router = useRouter();
  const sync = useEstadoSync();
  const ancha = usePantallaAncha();
  const alCostado = usePanelAlCostado();
  const datos = useDatosLocales();
  const estado = useEstadoSalon(datos);
  const operadorId = useOperadorDe(datos, usuario.id);
  const comandas = useMemo(() => (datos ? reducirCocina(datos.eventos) : null), [datos]);
  const caja = useMemo(() => (datos ? reducirCaja(datos.eventos) : null), [datos]);
  const [sectorElegido, setSectorElegido] = useState<string | null>(null);
  const [cuentaAbierta, setCuentaAbierta] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<{ tipo: TipoCuenta; mesaId: string | null } | null>(null);
  const [eligiendoEntre, setEligiendoEntre] = useState<Cuenta[] | null>(null);
  const [editando, setEditando] = useState(false);
  const [viendoLlevar, setViendoLlevar] = useState(false);
  const [viendoReservas, setViendoReservas] = useState(false);
  const [viendoCaja, setViendoCaja] = useState(false);
  /** La cuenta que se está mudando: mientras tanto, tocar una mesa libre la lleva ahí. */
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const toast = useToast();
  // Antes del corte de carga: un hook no puede ir después de un return. Mientras carga, el operador es quien inició la sesión.
  const operador: Operador = datos?.catalogo.operadores.find((o) => o.id === operadorId) ?? { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
  const registrar = useRegistrar(operador);

  useEffect(() => {
    if (!moviendo) return;
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setMoviendo(null);
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [moviendo]);

  // Cocina no opera el salón: su inicio es la pantalla de comandas.
  const soloCocina = !puede({ rol: vista }, 'salon.operar') && puede({ rol: vista }, 'cocina.operar');
  useEffect(() => {
    if (soloCocina) router.replace('/cocina');
  }, [soloCocina, router]);

  if (!datos?.dispositivoId || !estado) return <CargandoTarjeta />;

  const { catalogo } = datos;
  const turno = caja ? turnoAbierto(caja) : null;
  const puedeOperar = puede(operador, 'salon.operar');
  const puedeEditar = puede(usuario, 'plano.administrar') && puede({ rol: vista }, 'plano.administrar');
  const sector = catalogo.sectores.find((s) => s.id === sectorElegido) ?? catalogo.sectores[0] ?? null;
  const siguienteSector = sector ? catalogo.sectores[(catalogo.sectores.indexOf(sector) + 1) % catalogo.sectores.length] : null;
  const mesas = vistaDeMesas(estado);
  const sinMesa = cuentasAbiertas(estado).filter((c) => c.tipo === 'mostrador');
  const paraLlevar = cuentasAbiertas(estado).filter((c) => c.tipo === 'llevar');
  const cuenta = cuentaAbierta ? estado.cuentas.get(cuentaAbierta) : undefined;
  // Con el panel de la cuenta al costado, lo que flota contra el borde derecho del plano se corre su ancho
  // (22rem, el de `.modal-lateral`) para no quedar tapado. Va en línea: una clase competía con `inset-x`.
  const corrimiento = { right: cuenta && !moviendo && alCostado ? 'calc(22rem + 0.75rem)' : '0.75rem', transition: 'right 200ms cubic-bezier(0.2, 0, 0.13, 1)' };
  const elementos = sector ? catalogo.elementos.filter((e) => e.sectorId === sector.id) : [];

  const listos = comandas ? itemsListos(comandas) : new Set<string>();

  function marcaDeMesa(mesaId: string): MarcaMesa | undefined {
    const v = mesas.get(mesaId);
    if (!v) return undefined;
    const primera = v.cuentas[0]!;
    return {
      // Sólo ocupada o libre: demoras, precuenta y lo demás se ven al abrir la cuenta.
      tono: 'ocupada',
      // Ni el tiempo ni el total van en la mesa: se ven en el panel de la cuenta.
      lineas: [],
      pie: nombreOperador(catalogo, primera.mozoId).split(' ')[0],
      ocupadas: v.cuentas.reduce((s, c) => s + c.comensales, 0),
    };
  }

  const cuentaMoviendo = moviendo ? estado.cuentas.get(moviendo) : undefined;
  const nombreDe = (c: Cuenta) => nombreCuenta(catalogo, c);

  function moverA(mesaId: string) {
    const c = cuentaMoviendo;
    if (!c) return setMoviendo(null);
    if (mesaId === c.mesaId) return setMoviendo(null);
    if (mesas.has(mesaId)) return toast.alerta('Esa mesa está ocupada', 'Elegí una libre.');
    void (async () => {
      if (!(await registrar('cuenta_movida', c.id, { mesaDestinoId: mesaId }))) return;
      toast.exito('Cuenta movida', `${nombreDe(c)} → ${nombreMesa(catalogo, mesaId)}`);
      setMoviendo(null);
      setCuentaAbierta(c.id);
    })();
  }

  function tocarMesa(mesaId: string) {
    if (!puedeOperar) return;
    if (moviendo) return moverA(mesaId);
    const v = mesas.get(mesaId);
    if (!v) return setAbriendo({ tipo: 'mesa', mesaId });
    if (v.cuentas.length === 1) return setCuentaAbierta(v.cuentas[0]!.id);
    setEligiendoEntre(v.cuentas);
  }

  const alternaSectores = ALTERNAR_SECTORES && catalogo.sectores.length > 1;
  const ocupadasPorSector =(sectorId: string) => catalogo.elementos.filter((e) => e.sectorId === sectorId && mesas.has(e.id)).length;

  const panelSinMesa = sinMesa.length > 0 && ancha;
  const margenes: Margenes = ancha
    ? { arriba: 80, abajo: 24, izquierda: panelSinMesa ? 272 : 24, derecha: 72 }
    : { arriba: 72, abajo: sinMesa.length ? 140 : 72, izquierda: 12, derecha: 12 };
  const hayConflicto = [...mesas.values()].some((v) => v.cuentas.length > 1);

  return (
    <div className="pantalla-completa">
      {editando ? (
        <EditorPlano
          inicial={{ sectores: catalogo.sectores, elementos: catalogo.elementos }}
          sectorInicial={sector?.id ?? null}
          mesasConCuenta={new Set(mesas.keys())}
          alSalir={(id) => {
            setEditando(false);
            setSectorElegido(id);
          }}
        />
      ) : (
        <>
          {sector ? (
            <div className="absolute inset-0">
              <LienzoPlanoDinamico
                sector={sector}
                elementos={elementos}
                modo="operacion"
                marcaDeMesa={marcaDeMesa}
                alTocarMesa={tocarMesa}
                margenes={margenes}
                estiloControles={corrimiento}
                claseControles={cn('right-3', ancha || !sinMesa.length ? 'bottom-4' : 'bottom-[4.75rem]')}
              />
            </div>
          ) : (
            <div className="grid h-full place-items-center p-6">
              <div className="flex flex-col items-center gap-4">
                <EstadoVacio
                  icono={<LayoutGrid size={28} strokeWidth={1.5} />}
                  titulo="Todavía no hay un plano del salón"
                  detalle={puedeEditar ? 'Armalo con las mesas, la barra y lo que haya en el local.' : 'Lo arma el dueño desde acá.'}
                />
                {puedeEditar ? (
                  <Boton variante="primario" onClick={() => setEditando(true)}>
                    <PencilRuler size={15} strokeWidth={1.75} /> Armar el plano
                  </Boton>
                ) : null}
              </div>
            </div>
          )}

          {cuentaMoviendo ? (
            <div className="pointer-events-none absolute inset-x-3 bottom-4 z-10 flex justify-center">
              <div className="panel-flotante pointer-events-auto flex items-center gap-3 py-2 pl-4 pr-2">
                <MoveRight size={16} strokeWidth={1.5} className="shrink-0 text-acento" />
                <p className="text-sm text-tinta">
                  Tocá la mesa libre a la que va <strong className="font-medium">{nombreDe(cuentaMoviendo)}</strong>
                </p>
                <Boton variante="secundario" tamano="sm" onClick={() => setMoviendo(null)}>
                  Cancelar
                </Boton>
              </div>
            </div>
          ) : null}

          {/* Arriba: sectores, estado de la conexión y las acciones. */}
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2" style={corrimiento}>
            <div className="flex max-w-full flex-col items-start gap-2">
              {alternaSectores || !sync.enLinea || datos.pendientes > 0 ? (
                <div className="panel-flotante pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto p-1">
                  {alternaSectores && sector ? (
                    <Boton
                      variante="fantasma"
                      tamano="sm"
                      className={cn(BOTON_BARRA, 'shrink-0')}
                      aria-label={`${sector.nombre}. Pasar a ${siguienteSector!.nombre}`}
                      onClick={() => setSectorElegido(siguienteSector!.id)}
                    >
                      <Layers size={14} strokeWidth={1.5} /> {sector.nombre}
                      {ocupadasPorSector(sector.id) ? <span className="tabular-nums text-tinta-tenue">{ocupadasPorSector(sector.id)}</span> : null}
                    </Boton>
                  ) : null}
                  {!sync.enLinea ? (
                    <Insignia tono="alerta" className="shrink-0">
                      <CloudOff size={12} strokeWidth={2} aria-hidden="true" /> Sin conexión
                    </Insignia>
                  ) : null}
                  {datos.pendientes > 0 ? (
                    <Insignia tono="neutro" className="shrink-0">
                      {datos.pendientes} sin enviar
                    </Insignia>
                  ) : null}
                </div>
              ) : null}
              {hayConflicto ? (
                <div className="pointer-events-auto max-w-md">
                  <Aviso tono="error">Hay mesas con dos cuentas abiertas. Pasa cuando se abren sin conexión desde dos dispositivos: mové una de las dos a otra mesa desde su cuenta.</Aviso>
                </div>
              ) : null}
              {!puedeOperar ? (
                <div className="pointer-events-auto max-w-md">
                  <Aviso tono="alerta">{operador.nombre} no tiene permiso para operar el salón desde este dispositivo.</Aviso>
                </div>
              ) : null}
            </div>

            <div className="panel-flotante pointer-events-auto flex items-center gap-0.5 p-1">
              {puede({ rol: vista }, 'caja.operar') ? (
                <Boton variante="fantasma" tamano="sm" className={BOTON_BARRA} onClick={() => setViendoCaja(true)} aria-label="Caja">
                  <CircleDollarSign size={17} strokeWidth={1.5} /> <span className="max-sm:hidden">Caja</span>
                </Boton>
              ) : null}
              {puedeOperar ? (
                <>
                  {puede({ rol: vista }, 'reservas.operar') ? (
                    <Boton variante="fantasma" tamano="sm" className={BOTON_BARRA} onClick={() => setViendoReservas(true)} aria-label="Reservas de hoy">
                      <CalendarDays size={17} strokeWidth={1.5} /> <span className="max-sm:hidden">Reservas</span>
                      {reservasHoy.length ? <span className="tabular-nums text-tinta-tenue">{reservasHoy.length}</span> : null}
                    </Boton>
                  ) : null}
                  <Boton variante="fantasma" tamano="sm" className={BOTON_BARRA} onClick={() => setAbriendo({ tipo: 'mostrador', mesaId: null })} aria-label="Mostrador">
                    <Store size={17} strokeWidth={1.5} /> <span className="max-sm:hidden">Mostrador</span>
                  </Boton>
                  <Boton variante="fantasma" tamano="sm" className={BOTON_BARRA} onClick={() => setViendoLlevar(true)} aria-label="Para llevar">
                    <ShoppingBag size={17} strokeWidth={1.5} /> <span className="max-sm:hidden">Para llevar</span>
                    {paraLlevar.length ? <span className="tabular-nums text-tinta-tenue">{paraLlevar.length}</span> : null}
                  </Boton>
                </>
              ) : null}
            </div>
          </div>

          {/* Las de mostrador: a la izquierda en pantalla ancha, en una tira en el celular. Las para llevar van en su modal. */}
          {sinMesa.length ? (
            <div
              className={cn(
                'panel-flotante absolute flex gap-1 p-1.5',
                ancha ? 'left-3 top-20 max-h-[calc(100%-10rem)] w-60 flex-col overflow-y-auto' : 'inset-x-3 bottom-3 overflow-x-auto',
              )}
            >
              {ancha ? <p className="px-2 pb-1 pt-1 text-xs font-medium text-tinta-tenue">Mostrador</p> : null}
              {sinMesa.map((c) => (
                <FilaCuentaSinMesa key={c.id} cuenta={c} catalogo={catalogo} alElegir={() => setCuentaAbierta(c.id)} />
              ))}
            </div>
          ) : null}

          {/* Sin plano no hay nada que operar, y el dueño tiene que poder armarlo. */}
          {!turno && sector ? <CartelAbrirCaja operador={operador} verCajas={puede({ rol: vista }, 'reportes.ver')} /> : null}
        </>
      )}

      {abriendo ? (
        <ModalAbrirCuenta
          abierto
          tipo={abriendo.tipo}
          mesaId={abriendo.mesaId}
          catalogo={catalogo}
          operador={operador}
          alCerrar={() => setAbriendo(null)}
          alAbrir={(id) => {
            setAbriendo(null);
            setCuentaAbierta(id);
          }}
        />
      ) : null}

      {viendoCaja && caja ? <ModalCaja caja={caja} cuentas={estado.cuentas} catalogo={catalogo} operador={operador} alCerrar={() => setViendoCaja(false)} /> : null}

      {viendoReservas ? (
        <ModalReservasHoy
          reservas={reservasHoy}
          alCerrar={() => setViendoReservas(false)}
          alSentar={(id) => setCuentaAbierta(id)}
        />
      ) : null}

      {viendoLlevar ? (
        <ModalParaLlevar
          cuentas={paraLlevar}
          catalogo={catalogo}
          puedeAbrir={puedeOperar}
          alCerrar={() => setViendoLlevar(false)}
          alElegir={(id) => {
            setViendoLlevar(false);
            setCuentaAbierta(id);
          }}
          alNueva={() => {
            setViendoLlevar(false);
            setAbriendo({ tipo: 'llevar', mesaId: null });
          }}
        />
      ) : null}

      {eligiendoEntre ? (
        <Modal abierto alCerrar={() => setEligiendoEntre(null)} titulo="Esta mesa tiene dos cuentas">
          <div className="modal-cuerpo flex flex-col gap-2">
            {eligiendoEntre.map((c) => (
              <Boton
                key={c.id}
                variante="secundario"
                ancho
                onClick={() => {
                  setEligiendoEntre(null);
                  setCuentaAbierta(c.id);
                }}
              >
                {nombreOperador(catalogo, c.mozoId)} · {pesosDesdeCentavos(totalCuenta(c))}
              </Boton>
            ))}
          </div>
        </Modal>
      ) : null}

      {cuenta && cuenta.estado === 'abierta' && !moviendo ? (
        <PanelCuenta key={cuenta.id} cuenta={cuenta} listos={listos} catalogo={catalogo} operador={operador} turnoId={turno?.id ?? null} alMover={() => setMoviendo(cuenta.id)} alCerrar={() => setCuentaAbierta(null)} />
      ) : null}
    </div>
  );
}
