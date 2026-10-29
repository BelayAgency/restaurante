'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { ArrowDownToLine, CalendarCheck, CircleDollarSign, Lock, LockOpen, Printer, Split, Tablet } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CargandoTarjeta } from '@/components/carga';
import { Isla, type ItemIsla } from '@/components/isla';
import { useToast } from '@/components/toast';
import { Aviso, EstadoVacio, Insignia, Tarjeta, TituloSeccion } from '@/components/ui';
import { puede } from '@/dominio/permisos';
import { arqueo, diferenciaTotal, reducirCaja, turnoAbierto } from '@/dominio/reductores/caja';
import { cuentasAbiertas, importeItem, reducirSalon, saldoCuenta, totalCuenta, type Cuenta } from '@/dominio/reductores/salon';
import { duracionCorta, minutosDesde, useAhora } from '@/lib/ahora';
import { cn } from '@/lib/cn';
import { fechaHora, pesosDesdeCentavos } from '@/lib/formato';
import { NOMBRE_SISTEMA } from '@/lib/marca';
import { useDatosLocales, useOperadorDe } from '@/local/salon';
import { imprimirPrecuenta } from '../salon/imprimir-precuenta';
import { nombreMesa, nombreOperador, useRegistrar, type Operador } from '../salon/contexto';
import { useSesion } from '../sesion-cliente';
import { CuentasCerradas } from './cuentas-cerradas';
import { ModalCobro } from './modal-cobro';
import { ModalAbrirCaja, ModalArqueo, ModalSalida } from './modales-turno';

type Abierto = 'abrir' | 'salida' | 'arqueo' | 'cobro-total' | 'cobro-partes' | null;

/** La caja del mostrador: las cuentas abiertas a la izquierda, la elegida a la derecha, y la isla con los atajos. */
export function PantallaCaja() {
  const { usuario } = useSesion();
  const toast = useToast();
  const ahora = useAhora();
  const datos = useDatosLocales();
  const operadorId = useOperadorDe(datos, usuario.id);
  const [elegida, setElegida] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [, iniciar] = useTransition();

  const salon = useMemo(() => (datos ? reducirSalon(datos.eventos) : null), [datos]);
  const caja = useMemo(() => (datos ? reducirCaja(datos.eventos) : null), [datos]);

  const catalogo = datos?.catalogo;
  const operador: Operador = catalogo?.operadores.find((o) => o.id === operadorId) ?? { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
  const registrar = useRegistrar(operador);

  if (!datos || !salon || !caja || !catalogo) return <CargandoTarjeta />;
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

  const turno = turnoAbierto(caja);
  const cuentas = cuentasAbiertas(salon).sort((a, b) => Number(b.pidioCuenta) - Number(a.pidioCuenta) || a.abiertaEn.localeCompare(b.abiertaEn));
  const cuenta = elegida ? salon.cuentas.get(elegida) : undefined;
  const cuentaActiva = cuenta?.estado === 'abierta' ? cuenta : undefined;
  const nombreCuenta = (c: Cuenta) => (c.tipo === 'mesa' ? nombreMesa(catalogo, c.mesaId) : c.nombre ?? (c.tipo === 'llevar' ? 'Para llevar' : 'Mostrador'));
  const puedeOperar = puede(operador, 'caja.operar');
  // La diferencia del arqueo la ve quien controla, no quien cuenta.
  const veDiferencias = puede(usuario, 'dia.cerrar');
  const ultimoCerrado = [...caja.turnos.values()].filter((t) => t.cerradoEn).sort((a, b) => b.cerradoEn!.localeCompare(a.cerradoEn!))[0];

  function precuenta() {
    if (!cuentaActiva) return;
    iniciar(async () => {
      const ok = await registrar('precuenta_emitida', cuentaActiva.id, { precuentaId: crypto.randomUUID(), totalCentavos: totalCuenta(cuentaActiva) });
      if (ok && !imprimirPrecuenta(cuentaActiva, { local: NOMBRE_SISTEMA, mesa: nombreCuenta(cuentaActiva), mozo: nombreOperador(catalogo!, cuentaActiva.mozoId) })) {
        toast.alerta('Precuenta registrada', 'El navegador bloqueó la ventana de impresión.');
      }
    });
  }

  const sinCuenta = !cuentaActiva || saldoCuenta(cuentaActiva) <= 0;
  const cerradas = [...salon.cuentas.values()]
    .filter((c) => c.estado === 'cerrada')
    .sort((a, b) => (b.cerradaEn ?? '').localeCompare(a.cerradaEn ?? ''))
    .slice(0, 10);
  const items: ItemIsla[] = [
    { id: 'cobrar', etiqueta: 'Cobrar', icono: <CircleDollarSign size={20} strokeWidth={1.5} />, atajo: 'c', primaria: true, alApretar: () => setAbierto('cobro-total'), deshabilitada: !turno || sinCuenta || !puedeOperar },
    { id: 'dividir', etiqueta: 'Dividir', icono: <Split size={20} strokeWidth={1.5} />, atajo: 'd', alApretar: () => setAbierto('cobro-partes'), deshabilitada: !turno || sinCuenta || !puedeOperar },
    { id: 'precuenta', etiqueta: 'Precuenta', icono: <Printer size={20} strokeWidth={1.5} />, atajo: 'p', alApretar: precuenta, deshabilitada: !cuentaActiva || !puedeOperar },
    { id: 'salida', etiqueta: 'Retiro', icono: <ArrowDownToLine size={20} strokeWidth={1.5} />, atajo: 'r', alApretar: () => setAbierto('salida'), deshabilitada: !turno || !puedeOperar },
    turno
      ? { id: 'cerrar', etiqueta: 'Cerrar caja', icono: <Lock size={20} strokeWidth={1.5} />, atajo: 'x', alApretar: () => setAbierto('arqueo'), deshabilitada: !puedeOperar }
      : { id: 'abrir', etiqueta: 'Abrir caja', icono: <LockOpen size={20} strokeWidth={1.5} />, atajo: 'a', alApretar: () => setAbierto('abrir'), deshabilitada: !puedeOperar },
  ];

  return (
    <div style={{ paddingBottom: 'var(--isla-hueco)' }}>
      <TituloSeccion
        accion={
          puede(usuario, 'dia.cerrar') ? (
            <Link href="/caja/cierre" className="inline-flex items-center gap-1.5 text-sm font-medium text-acento hover:underline">
              <CalendarCheck size={15} strokeWidth={1.5} /> Cierre del día
            </Link>
          ) : null
        }
      >
        Caja
      </TituloSeccion>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
        {turno ? (
          <Insignia tono="exito">
            Abierta por {nombreOperador(catalogo, turno.abiertoPor)} · {fechaHora(turno.abiertoEn)}
          </Insignia>
        ) : (
          <Insignia tono="neutro">Caja cerrada</Insignia>
        )}
        <span>
          Opera <strong className="font-medium text-tinta">{operador.nombre}</strong>
        </span>
      </div>

      {!puedeOperar ? (
        <div className="mb-4">
          <Aviso tono="alerta">{operador.nombre} no tiene permiso para operar la caja.</Aviso>
        </div>
      ) : null}

      {!turno && ultimoCerrado && veDiferencias ? (
        <div className="mb-4">
          <Aviso tono={diferenciaTotal(arqueo(ultimoCerrado, catalogo.medios)) === 0 ? 'exito' : 'alerta'} titulo="Último arqueo">
            Diferencia: {pesosDesdeCentavos(diferenciaTotal(arqueo(ultimoCerrado, catalogo.medios)))} · cerró {nombreOperador(catalogo, ultimoCerrado.cerradoPor ?? '')}
          </Aviso>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Tarjeta padding={false} className="p-2">
          {cuentas.length === 0 ? (
            <EstadoVacio titulo="No hay cuentas abiertas" />
          ) : (
            <ul className="flex flex-col gap-1">
              {cuentas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setElegida(c.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border-0 px-3 py-2.5 text-left transition-colors',
                      c.id === elegida ? 'bg-acento-tenue' : 'bg-transparent hover:bg-fill-fantasma-hover',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-tinta">{nombreCuenta(c)}</span>
                      <span className="text-xs text-tinta-tenue">
                        {nombreOperador(catalogo, c.mozoId)} · {duracionCorta(minutosDesde(c.abiertaEn, ahora))}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="text-sm tabular-nums text-tinta">{pesosDesdeCentavos(saldoCuenta(c))}</span>
                      {c.pidioCuenta ? <Insignia tono="alerta">Pidió</Insignia> : c.precuentas.length ? <Insignia tono="exito">Precuenta</Insignia> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta>
          {!cuentaActiva ? (
            <EstadoVacio titulo="Elegí una cuenta" detalle="Atajos: C cobrar, D dividir, P precuenta, R retiro. Mantené Alt para verlos." />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold text-tinta">{nombreCuenta(cuentaActiva)}</p>
                <p className="text-sm text-tinta-suave">
                  {nombreOperador(catalogo, cuentaActiva.mozoId)} · {cuentaActiva.comensales} comensales
                </p>
              </div>
              {cuentaActiva.cambiosTrasPrecuenta > 0 ? (
                <div className="mb-3">
                  <Aviso tono="alerta">La cuenta cambió después de la precuenta.</Aviso>
                </div>
              ) : null}
              <ul className="mb-3">
                {[...cuentaActiva.items.values()].map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3 border-b border-borde/60 py-2 text-sm last:border-0">
                    <span className={cn('text-tinta', cuentaActiva.itemsPagados.has(item.id) && 'text-tinta-tenue line-through')}>
                      {item.cantidad} × {item.nombre}
                      {item.estado === 'borrador' ? <Insignia tono="alerta" className="ml-2">Sin enviar</Insignia> : null}
                    </span>
                    <span className="tabular-nums text-tinta">{pesosDesdeCentavos(importeItem(item))}</span>
                  </li>
                ))}
              </ul>
              <dl className="flex flex-col gap-1 border-t border-borde pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-tinta-suave">Total</dt>
                  <dd className="tabular-nums text-tinta">{pesosDesdeCentavos(totalCuenta(cuentaActiva))}</dd>
                </div>
                {cuentaActiva.pagadoCentavos > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-tinta-suave">Cobrado</dt>
                    <dd className="tabular-nums text-tinta">− {pesosDesdeCentavos(cuentaActiva.pagadoCentavos)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-semibold">
                  <dt className="text-tinta">Saldo</dt>
                  <dd className="tabular-nums text-tinta">{pesosDesdeCentavos(saldoCuenta(cuentaActiva))}</dd>
                </div>
              </dl>
              {!turno ? <p className="mt-3 text-sm text-tinta-tenue">Abrí la caja para cobrar.</p> : null}
              {saldoCuenta(cuentaActiva) > 0 && puedeOperar ? (
                <div className="mt-4">
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    onClick={() =>
                      iniciar(async () => {
                        // Con saldo, cerrar es cerrar sin cobrar: pide autorización.
                        if (await registrar('cuenta_cerrada', cuentaActiva.id, {})) toast.exito('Cuenta cerrada sin cobrar');
                      })
                    }
                  >
                    Cerrar sin cobrar
                  </Boton>
                </div>
              ) : null}
            </>
          )}
        </Tarjeta>
      </div>

      <section className="mt-8">
        <TituloSeccion descripcion="Reabrir una cuenta o corregir el medio de pago pide autorización.">Últimas cuentas cerradas</TituloSeccion>
        <Tarjeta>
          <CuentasCerradas cuentas={cerradas} catalogo={catalogo} operador={operador} nombreCuenta={nombreCuenta} />
        </Tarjeta>
      </section>

      <Isla items={items} />

      {abierto === 'abrir' ? <ModalAbrirCaja operador={operador} alCerrar={() => setAbierto(null)} /> : null}
      {abierto === 'salida' && turno ? <ModalSalida turnoId={turno.id} operador={operador} alCerrar={() => setAbierto(null)} /> : null}
      {abierto === 'arqueo' && turno ? <ModalArqueo turnoId={turno.id} medios={catalogo.medios} operador={operador} alCerrar={() => setAbierto(null)} /> : null}
      {(abierto === 'cobro-total' || abierto === 'cobro-partes') && turno && cuentaActiva ? (
        <ModalCobro
          cuenta={cuentaActiva}
          turnoId={turno.id}
          medios={catalogo.medios}
          operador={operador}
          divisionInicial={abierto === 'cobro-partes' ? 'partes' : 'total'}
          alCerrar={() => setAbierto(null)}
        />
      ) : null}
    </div>
  );
}
