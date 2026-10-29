'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloudOff, LayoutGrid, ShoppingBag, Store, Tablet } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CargandoTarjeta } from '@/components/carga';
import { Modal } from '@/components/modal';
import type { MarcaMesa } from '@/components/plano/lienzo-plano';
import { LienzoPlanoDinamico } from '@/components/plano/lienzo-plano-dinamico';
import { Tabs } from '@/components/tabs';
import { Aviso, EstadoVacio, Insignia, Tarjeta, TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { comandaDemorada, itemsListos, reducirCocina } from '@/dominio/reductores/cocina';
import { cuentasAbiertas, totalCuenta, vistaDeMesas, type Cuenta } from '@/dominio/reductores/salon';
import { duracionCorta, minutosDesde, useAhora } from '@/lib/ahora';
import { pesosDesdeCentavos } from '@/lib/formato';
import { useDatosLocales, useEstadoSalon, useOperadorDe } from '@/local/salon';
import { useEstadoSync } from '../motor-sync';
import { useSesion } from '../sesion-cliente';
import { nombreOperador, type Operador } from './contexto';
import { ModalAbrirCuenta, type TipoCuenta } from './modal-abrir-cuenta';
import { PanelCuenta } from './panel-cuenta';

/**
 * El inicio: el plano del local con el estado de cada mesa. Todo sale de la
 * base del dispositivo, así que se sigue operando sin red. Por eso el panel
 * de la cuenta se abre con estado local y no con la URL: cambiar la URL le
 * pide la página al servidor, y sin red eso no vuelve.
 */
export function Salon() {
  const { usuario, vista } = useSesion();
  const router = useRouter();
  const sync = useEstadoSync();
  const ahora = useAhora();
  const datos = useDatosLocales();
  const estado = useEstadoSalon(datos);
  const operadorId = useOperadorDe(datos, usuario.id);
  const comandas = useMemo(() => (datos ? reducirCocina(datos.eventos) : null), [datos]);
  const [sectorElegido, setSectorElegido] = useState<string | null>(null);
  const [cuentaAbierta, setCuentaAbierta] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<{ tipo: TipoCuenta; mesaId: string | null } | null>(null);
  const [eligiendoEntre, setEligiendoEntre] = useState<Cuenta[] | null>(null);

  // Cocina no opera el salón: su inicio es la pantalla de comandas.
  const soloCocina = !puede({ rol: vista }, 'salon.operar') && puede({ rol: vista }, 'cocina.operar');
  useEffect(() => {
    if (soloCocina) router.replace('/cocina');
  }, [soloCocina, router]);

  if (!datos || !estado) return <CargandoTarjeta />;

  if (!datos.dispositivoId) {
    return (
      <Tarjeta>
        <EstadoVacio
          icono={<Tablet size={28} strokeWidth={1.5} />}
          titulo="Este dispositivo no está registrado"
          detalle="Para operar el salón, incluso sin conexión, el dispositivo tiene que estar registrado."
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
  const enCatalogo = catalogo.operadores.find((o) => o.id === operadorId);
  const operador: Operador = enCatalogo ?? { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
  const sector = catalogo.sectores.find((s) => s.id === sectorElegido) ?? catalogo.sectores[0] ?? null;
  const mesas = vistaDeMesas(estado);
  const sinMesa = cuentasAbiertas(estado).filter((c) => !c.mesaId);
  const cuenta = cuentaAbierta ? estado.cuentas.get(cuentaAbierta) : undefined;

  const cuentasDemoradas = new Set([...(comandas?.values() ?? [])].filter((c) => comandaDemorada(c, ahora)).map((c) => c.cuentaId));
  const listos = comandas ? itemsListos(comandas) : new Set<string>();

  function marcaDeMesa(mesaId: string): MarcaMesa | undefined {
    const vista = mesas.get(mesaId);
    if (!vista) return undefined;
    const primera = vista.cuentas[0]!;
    const total = vista.cuentas.reduce((s, c) => s + totalCuenta(c), 0);
    // Un pedido demorado pesa más que el resto del estado: es lo que hay que mirar ya.
    const demorada = vista.cuentas.some((c) => cuentasDemoradas.has(c.id));
    return {
      tono: vista.cuentas.length > 1 ? 'conflicto' : demorada ? 'demorada' : vista.estado,
      lineas: [duracionCorta(minutosDesde(primera.abiertaEn, ahora)), pesosDesdeCentavos(total).replace(',00', '')],
    };
  }

  function tocarMesa(mesaId: string) {
    const vista = mesas.get(mesaId);
    if (!vista) return setAbriendo({ tipo: 'mesa', mesaId });
    if (vista.cuentas.length === 1) return setCuentaAbierta(vista.cuentas[0]!.id);
    setEligiendoEntre(vista.cuentas);
  }

  return (
    <>
      <TituloSeccion
        accion={
          puede(operador, 'salon.operar') ? (
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" onClick={() => setAbriendo({ tipo: 'mostrador', mesaId: null })}>
                <Store size={15} strokeWidth={1.5} /> Mostrador
              </Boton>
              <Boton variante="secundario" onClick={() => setAbriendo({ tipo: 'llevar', mesaId: null })}>
                <ShoppingBag size={15} strokeWidth={1.5} /> Para llevar
              </Boton>
            </div>
          ) : null
        }
      >
        Salón
      </TituloSeccion>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
        <span>
          Opera <strong className="font-medium text-tinta">{operador.nombre}</strong>
        </span>
        {!sync.enLinea ? (
          <Insignia tono="alerta">
            <CloudOff size={12} strokeWidth={2} aria-hidden="true" /> Sin conexión
          </Insignia>
        ) : null}
        {datos.pendientes > 0 ? <Insignia tono="neutro">{datos.pendientes} sin enviar</Insignia> : null}
      </div>

      {[...mesas.values()].some((v) => v.cuentas.length > 1) ? (
        <div className="mb-3">
          <Aviso tono="error">Hay mesas con dos cuentas abiertas. Pasa cuando se abren sin conexión desde dos dispositivos: unilas desde la cuenta.</Aviso>
        </div>
      ) : null}

      {!sector ? (
        <Tarjeta>
          <EstadoVacio
            icono={<LayoutGrid size={28} strokeWidth={1.5} />}
            titulo="Todavía no hay un plano del salón"
            detalle={puede(usuario, 'plano.administrar') ? 'Armalo desde Plano.' : 'El dueño lo arma desde Plano.'}
          />
        </Tarjeta>
      ) : (
        <>
          {catalogo.sectores.length > 1 ? (
            <div className="mb-3">
              <Tabs etiqueta="Sectores" valor={sector.id} alCambiar={setSectorElegido} opciones={catalogo.sectores.map((s) => ({ valor: s.id, etiqueta: s.nombre }))} />
            </div>
          ) : null}
          <Tarjeta padding={false} className="overflow-hidden p-2">
            <LienzoPlanoDinamico
              sector={sector}
              elementos={catalogo.elementos.filter((e) => e.sectorId === sector.id)}
              modo="operacion"
              marcaDeMesa={marcaDeMesa}
              alTocarMesa={tocarMesa}
            />
          </Tarjeta>
        </>
      )}

      {sinMesa.length ? (
        <section className="mt-6">
          <TituloSeccion>Cuentas sin mesa</TituloSeccion>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sinMesa.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCuentaAbierta(c.id)}
                className="tarjeta flex cursor-pointer items-center justify-between gap-3 border-0 p-4 text-left"
              >
                <span>
                  <span className="block text-sm font-medium text-tinta">{c.nombre ?? (c.tipo === 'llevar' ? 'Para llevar' : 'Mostrador')}</span>
                  <span className="text-xs text-tinta-tenue">
                    {nombreOperador(catalogo, c.mozoId)} · {duracionCorta(minutosDesde(c.abiertaEn, ahora))}
                  </span>
                </span>
                <span className="text-sm tabular-nums text-tinta">{pesosDesdeCentavos(totalCuenta(c))}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

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

      {cuenta && cuenta.estado === 'abierta' ? (
        <PanelCuenta key={cuenta.id} cuenta={cuenta} estado={estado} listos={listos} catalogo={catalogo} operador={operador} alCerrar={() => setCuentaAbierta(null)} />
      ) : null}

      {puede(operador, 'salon.operar') ? null : (
        <div className="mt-4">
          <Aviso tono="alerta">{operador.nombre} no tiene permiso para operar el salón desde este dispositivo.</Aviso>
        </div>
      )}
    </>
  );
}
