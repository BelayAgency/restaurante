'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDownToLine, Ban, ListFilter, Lock, LockOpen, Receipt, Wallet } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { CifraPeriodo } from '@/components/periodo';
import { MenuAcciones } from '@/components/menu-acciones';
import { useToast } from '@/components/toast';
import { EstadoVacio } from '@/components/ui';
import type { Catalogo } from '@/dominio/catalogo';
import { puede } from '@/dominio/permisos';
import { movimientosDeTurno, type EstadoCaja, type MovimientoCaja, type Turno } from '@/dominio/reductores/caja';
import { cuentasAbiertas, type Cuenta } from '@/dominio/reductores/salon';
import { diaLocal } from '@/dominio/reservas';
import { cn } from '@/lib/cn';
import { fechaCorta, hora, pesosDesdeCentavos } from '@/lib/formato';
import { nombreCuenta, useNombreOperador, type Operador } from '../salon/contexto';
import { useSesion } from '../sesion-cliente';
import { DetalleMovimiento } from './detalle-movimiento';
import { ModalArqueo, ModalSalida } from './modales-turno';
import { TotalesTurno } from './totales-turno';

type Filtro = 'todos' | 'cobros' | 'salidas';

const FILTROS: Record<Filtro, string> = { todos: 'Todos', cobros: 'Cuentas', salidas: 'Retiros y gastos' };

const ICONO: Record<MovimientoCaja['clase'], ReactNode> = {
  apertura: <LockOpen size={15} strokeWidth={1.5} />,
  cierre: <Lock size={15} strokeWidth={1.5} />,
  cobro: <Receipt size={15} strokeWidth={1.5} />,
  sin_cobrar: <Ban size={15} strokeWidth={1.5} />,
  retiro: <ArrowDownToLine size={15} strokeWidth={1.5} />,
  egreso: <Wallet size={15} strokeWidth={1.5} />,
};

// Con la fecha del local, no la del ISO: una caja que abre a las 23 hora argentina ya es el día siguiente en UTC.
const diaDe = (iso: string) => diaLocal(new Date(iso));

function rangoTurno(t: Turno): string {
  const desde = `${fechaCorta(diaDe(t.abiertoEn))} ${hora(t.abiertoEn)}`;
  if (!t.cerradoEn) return desde;
  return `${desde} – ${diaDe(t.cerradoEn) === diaDe(t.abiertoEn) ? '' : `${fechaCorta(diaDe(t.cerradoEn)).slice(0, 5)} `}${hora(t.cerradoEn)}`;
}

/** La hora, y el día delante si no es el mismo en que abrió la caja (un turno que pasa la medianoche). */
function momentoEnTurno(iso: string, turno: Turno): string {
  return diaDe(iso) === diaDe(turno.abiertoEn) ? hora(iso) : `${fechaCorta(diaDe(iso)).slice(0, 5)} ${hora(iso)}`;
}

/**
 * La caja abierta, desde el salón: sus totales y todo lo que pasó por ella.
 * Tocar un movimiento abre su detalle (la cuenta completa de un cobro, el
 * motivo de un gasto). Los turnos anteriores se miran en Reportes.
 */
export function ModalCaja({ caja, cuentas, catalogo, operador, alCerrar }: { caja: EstadoCaja; cuentas: Map<string, Cuenta>; catalogo: Catalogo; operador: Operador; alCerrar: () => void }) {
  const { usuario } = useSesion();
  const nombre = useNombreOperador(catalogo);
  const toast = useToast();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [detalle, setDetalle] = useState<MovimientoCaja | null>(null);
  const [accion, setAccion] = useState<'salida' | 'arqueo' | null>(null);

  const turno = [...caja.turnos.values()].find((t) => !t.cerradoEn) ?? null;
  const movimientos = turno ? movimientosDeTurno(turno, cuentas.values()) : [];
  const visibles = movimientos.filter((m) => filtro === 'todos' || (filtro === 'cobros' ? m.clase === 'cobro' || m.clase === 'sin_cobrar' : m.clase === 'retiro' || m.clase === 'egreso'));
  const puedeOperar = puede(operador, 'caja.operar');
  // El esperado y la diferencia los ve quien controla: el cajero cuenta a ciegas.
  const veDiferencias = puede(usuario, 'dia.cerrar');

  function descripcion(m: MovimientoCaja): { titulo: string; detalle: string } {
    const quien = nombre(m.operadorId);
    switch (m.clase) {
      case 'apertura':
        return { titulo: 'Apertura de caja', detalle: `${quien} · fondo inicial` };
      case 'cierre':
        return { titulo: 'Cierre de caja', detalle: `${quien} · declarado` };
      case 'retiro':
      case 'egreso':
        return { titulo: m.clase === 'retiro' ? `Retiro · ${m.motivo}` : `Gasto · ${m.motivo}`, detalle: quien };
      case 'cobro':
      case 'sin_cobrar': {
        const cuenta = cuentas.get(m.cuentaId);
        const deCuenta = cuenta ? nombreCuenta(catalogo, cuenta) : 'Cuenta';
        if (m.clase === 'sin_cobrar') return { titulo: `${deCuenta} · cerrada sin cobrar`, detalle: quien };
        const cobro = cuenta?.cobros.find((c) => c.id === m.id);
        return { titulo: deCuenta, detalle: `${quien}${cobro ? ` · ${cobro.pagos.map((p) => p.nombre).join(' + ')}` : ''}` };
      }
    }
  }

  function cerrarCaja() {
    // Con una cuenta abierta el arqueo queda incompleto: esa plata entra después, en otro turno.
    const abiertas = cuentasAbiertas({ cuentas, anomalias: [] }).length;
    if (abiertas) return toast.error(abiertas === 1 ? 'Hay una cuenta abierta' : `Hay ${abiertas} cuentas abiertas`, 'Cobralas o cerralas antes de cerrar la caja.');
    setAccion('arqueo');
  }

  const ventas = turno ? turno.consumoCentavos : 0;
  const salidas = turno ? turno.salidas.reduce((s, x) => s + x.montoCentavos, 0) : 0;

  return (
    <>
      <Modal abierto alCerrar={alCerrar} titulo="Caja" ancho>
        <div className="modal-cuerpo">
          {!turno ? (
            <EstadoVacio titulo="No hay una caja abierta" detalle="Las cajas anteriores están en Reportes." />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-tinta">Caja de {nombre(turno.abiertoPor)}</p>
                  <p className="text-sm tabular-nums text-tinta-tenue">Abrió {rangoTurno(turno)}</p>
                </div>
                {puedeOperar ? (
                  <div className="flex gap-2">
                    <Boton variante="secundario" tamano="sm" onClick={() => setAccion('salida')}>
                      <ArrowDownToLine size={14} strokeWidth={1.5} /> Retiro o gasto
                    </Boton>
                    <Boton variante="primario" tamano="sm" onClick={cerrarCaja}>
                      <Lock size={14} strokeWidth={1.5} /> Cerrar caja
                    </Boton>
                  </div>
                ) : null}
              </div>

              {veDiferencias ? (
                <div className="mb-3">
                  <TotalesTurno turno={turno} medios={catalogo.medios} />
                  <p className="mt-2 text-sm tabular-nums text-tinta-suave">
                    Ventas {pesosDesdeCentavos(ventas)} · Propinas {pesosDesdeCentavos(turno.propinasCentavos)} · {turno.cobros} {turno.cobros === 1 ? 'cobro' : 'cobros'}
                  </p>
                </div>
              ) : (
                // El cajero no ve lo esperado: cuenta a ciegas al cerrar.
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <CifraPeriodo etiqueta="Ventas" valor={pesosDesdeCentavos(ventas)} />
                  <CifraPeriodo etiqueta="Propinas" valor={pesosDesdeCentavos(turno.propinasCentavos)} />
                  <CifraPeriodo etiqueta="Retiros y gastos" valor={salidas ? `− ${pesosDesdeCentavos(salidas)}` : pesosDesdeCentavos(0)} />
                </div>
              )}

              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-tinta">Movimientos</p>
                <MenuAcciones
                  etiqueta="Filtrar movimientos"
                  disparador={
                    <>
                      <ListFilter size={14} strokeWidth={1.5} /> Filtros
                      {/* Con un filtro puesto, un punto: que la lista corta no se lea como «no pasó nada más». */}
                      {filtro !== 'todos' ? <span className="size-1.5 rounded-full bg-acento" aria-label="Filtro activo" /> : null}
                    </>
                  }
                  acciones={(Object.keys(FILTROS) as Filtro[]).map((valor) => ({
                    texto: FILTROS[valor],
                    icono: null,
                    marcada: filtro === valor,
                    alElegir: () => setFiltro(valor),
                  }))}
                />
              </div>

              <ul aria-label="Movimientos">
                {visibles.length === 0 ? (
                  <li className="py-8 text-center text-sm text-tinta-tenue">No hay movimientos de este tipo</li>
                ) : (
                  visibles.map((m) => {
                    const { titulo, detalle: sub } = descripcion(m);
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => setDetalle(m)}
                          className="flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-2 py-2.5 text-left transition-colors hover:bg-fill-fantasma-hover"
                        >
                          <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', m.clase === 'sin_cobrar' ? 'bg-alerta-tenue text-alerta' : 'bg-lienzo text-tinta-tenue')}>
                            {ICONO[m.clase]}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-tinta">{titulo}</span>
                            <span className="block truncate text-xs text-tinta-tenue">
                              {momentoEnTurno(m.momento, turno)} · {sub}
                            </span>
                          </span>
                          <span className={cn('shrink-0 text-sm tabular-nums', m.montoCentavos < 0 ? 'text-error' : 'text-tinta')}>
                            {m.clase === 'sin_cobrar' ? '—' : m.montoCentavos < 0 ? `− ${pesosDesdeCentavos(-m.montoCentavos)}` : pesosDesdeCentavos(m.montoCentavos)}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </>
          )}
        </div>
      </Modal>

      {detalle && turno ? (
        <DetalleMovimiento movimiento={detalle} turno={turno} cuentas={cuentas} catalogo={catalogo} operador={operador} veDiferencias={veDiferencias} alCerrar={() => setDetalle(null)} />
      ) : null}
      {accion === 'salida' && turno ? <ModalSalida turnoId={turno.id} operador={operador} alCerrar={() => setAccion(null)} /> : null}
      {accion === 'arqueo' && turno ? <ModalArqueo turnoId={turno.id} medios={catalogo.medios} operador={operador} alCerrar={() => setAccion(null)} /> : null}
    </>
  );
}
