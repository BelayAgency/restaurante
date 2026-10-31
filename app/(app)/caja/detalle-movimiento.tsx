'use client';

import { useState, useTransition } from 'react';
import { RotateCcw } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { Aviso, FilaDato, Insignia, Tabla, Td, Th } from '@/components/ui';
import type { Catalogo } from '@/dominio/catalogo';
import { arqueo, type MovimientoCaja, type Turno } from '@/dominio/reductores/caja';
import { importeItem, totalCuenta, type Cobro, type Cuenta } from '@/dominio/reductores/salon';
import { cn } from '@/lib/cn';
import { centavosDesdeTexto, fechaHora, hora, pesosDesdeCentavos, textoDesdeCentavos } from '@/lib/formato';
import { nombreCuenta, useNombreOperador, useRegistrar, type Operador } from '../salon/contexto';

function ModalCorregirCobro({ cuentaId, cobro, catalogo, operador, alCerrar }: { cuentaId: string; cobro: Cobro; catalogo: Catalogo; operador: Operador; alCerrar: () => void }) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [pagos, setPagos] = useState(cobro.pagos.map((p) => ({ clave: crypto.randomUUID(), medioId: p.medioId as string | null, monto: textoDesdeCentavos(p.montoCentavos) })));
  const [error, setError] = useState<string>();
  const [ocupado, iniciar] = useTransition();
  const total = cobro.consumoCentavos + cobro.propinaCentavos;
  const suma = pagos.reduce((s, p) => s + (centavosDesdeTexto(p.monto || '0') ?? 0), 0);

  function corregir() {
    if (suma !== total) return setError(`Los pagos tienen que sumar ${pesosDesdeCentavos(total)}`);
    if (pagos.some((p) => !p.medioId)) return setError('Elegí el medio de cada pago');
    iniciar(async () => {
      const ok = await registrar('cobro_corregido', cuentaId, {
        cobroId: cobro.id,
        pagos: pagos.map((p) => {
          const medio = catalogo.medios.find((m) => m.id === p.medioId)!;
          return { medioId: medio.id, nombre: medio.nombre, efectivo: medio.efectivo, montoCentavos: centavosDesdeTexto(p.monto || '0') ?? 0 };
        }),
      });
      if (ok) {
        toast.exito('Medio de pago corregido');
        alCerrar();
      }
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Corregir el medio de pago" descripcion={`Cobro de ${pesosDesdeCentavos(total)}. Pide la autorización de un encargado.`}>
      <div className="modal-cuerpo flex flex-col gap-2">
        {pagos.map((p) => (
          <div key={p.clave} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Selector
                opciones={catalogo.medios.map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
                valor={p.medioId}
                alElegir={(medioId) => setPagos(pagos.map((x) => (x.clave === p.clave ? { ...x, medioId } : x)))}
              />
            </div>
            <NumeroInline etiqueta="Monto" valor={p.monto} alCambiar={(monto) => setPagos(pagos.map((x) => (x.clave === p.clave ? { ...x, monto } : x)))} decimales={2} className="w-32" />
          </div>
        ))}
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={ocupado}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={corregir} cargando={ocupado}>
          Corregir
        </Boton>
      </footer>
    </Modal>
  );
}

/**
 * La cuenta de la que salió un cobro, completa: qué se pidió (también lo
 * anulado y lo regalado, a la vista), los descuentos y cada cobro con sus
 * medios. Desde acá se corrige un medio de pago o se reabre la cuenta, las dos
 * con autorización.
 */
function DetalleCuenta({ cuenta, cobroId, catalogo, operador, alCerrar }: { cuenta: Cuenta; cobroId: string | null; catalogo: Catalogo; operador: Operador; alCerrar: () => void }) {
  const nombre = useNombreOperador(catalogo);
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [corrigiendo, setCorrigiendo] = useState<Cobro | null>(null);
  const [reabriendo, iniciar] = useTransition();
  const descuentos = cuenta.descuentos.reduce((s, d) => s + d.montoCentavos, 0);

  return (
    <>
      <Modal
        abierto
        alCerrar={alCerrar}
        titulo={nombreCuenta(catalogo, cuenta)}
        descripcion={`${nombre(cuenta.mozoId)}${cuenta.comensales ? ` · ${cuenta.comensales} ${cuenta.comensales === 1 ? 'comensal' : 'comensales'}` : ''}`}
      >
        <div className="modal-cuerpo flex flex-col gap-5">
          <dl>
            <FilaDato etiqueta="Abierta">{fechaHora(cuenta.abiertaEn)}</FilaDato>
            <FilaDato etiqueta="Cerrada">{cuenta.cerradaEn ? fechaHora(cuenta.cerradaEn) : cuenta.estado === 'abierta' ? 'Sigue abierta' : '—'}</FilaDato>
          </dl>
          {cuenta.estado === 'cerrada' && !cuenta.cobros.length ? <Aviso tono="alerta">Se cerró sin cobrar.</Aviso> : null}

          <section>
            <h3 className="mb-1 text-sm font-medium text-tinta-suave">Lo que se pidió</h3>
            <ul className="text-sm">
              {[...cuenta.items.values()].map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 border-b border-borde/60 py-2 last:border-0">
                  <span className={cn('min-w-0 text-tinta', (item.anulado || item.cortesia) && 'text-tinta-tenue line-through')}>
                    {item.cantidad} × {item.nombre}
                    {item.modificadores.length ? <span className="text-tinta-tenue"> · {item.modificadores.map((m) => m.nombre).join(', ')}</span> : null}
                    {item.anulado ? <Insignia tono="error" className="ml-2">Anulado</Insignia> : item.cortesia ? <Insignia tono="neutro" className="ml-2">Cortesía</Insignia> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-tinta">{pesosDesdeCentavos(importeItem(item))}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2 flex flex-col gap-1 border-t border-borde pt-2 text-sm">
              {descuentos ? (
                <div className="flex justify-between">
                  <dt className="text-tinta-suave">Descuentos</dt>
                  <dd className="tabular-nums text-tinta">− {pesosDesdeCentavos(descuentos)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between font-semibold">
                <dt className="text-tinta">Total</dt>
                <dd className="tabular-nums text-tinta">{pesosDesdeCentavos(totalCuenta(cuenta))}</dd>
              </div>
            </dl>
          </section>

          {cuenta.cobros.length ? (
            <section>
              <h3 className="mb-1 text-sm font-medium text-tinta-suave">Cobros</h3>
              <ul className="text-sm">
                {cuenta.cobros.map((c) => (
                  <li key={c.id} className={cn('flex items-start justify-between gap-3 rounded-lg px-2 py-2', c.id === cobroId && 'bg-acento-tenue')}>
                    <div className="min-w-0">
                      <p className="text-tinta">
                        {hora(c.cobradoEn)} · {nombre(c.cobradoPor)}
                      </p>
                      <p className="text-xs text-tinta-tenue">
                        {c.pagos.map((p) => `${p.nombre} ${pesosDesdeCentavos(p.montoCentavos)}`).join(' + ')}
                        {c.propinaCentavos ? ` · propina ${pesosDesdeCentavos(c.propinaCentavos)}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-tinta">{pesosDesdeCentavos(c.consumoCentavos + c.propinaCentavos)}</span>
                      <Boton variante="fantasma" tamano="sm" onClick={() => setCorrigiendo(c)}>
                        Corregir medio
                      </Boton>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        {cuenta.estado === 'cerrada' ? (
          <footer className="modal-pie">
            <Boton
              variante="secundario"
              cargando={reabriendo}
              onClick={() =>
                iniciar(async () => {
                  if (await registrar('cuenta_reabierta', cuenta.id, {})) {
                    toast.exito('Cuenta reabierta');
                    alCerrar();
                  }
                })
              }
            >
              <RotateCcw size={14} strokeWidth={1.5} /> Reabrir cuenta
            </Boton>
          </footer>
        ) : null}
      </Modal>
      {corrigiendo ? <ModalCorregirCobro cuentaId={cuenta.id} cobro={corrigiendo} catalogo={catalogo} operador={operador} alCerrar={() => setCorrigiendo(null)} /> : null}
    </>
  );
}

/** El detalle de lo que se tocó en la lista de movimientos de una caja. */
export function DetalleMovimiento({
  movimiento,
  turno,
  cuentas,
  catalogo,
  operador,
  veDiferencias,
  alCerrar,
}: {
  movimiento: MovimientoCaja;
  turno: Turno;
  cuentas: Map<string, Cuenta>;
  catalogo: Catalogo;
  operador: Operador;
  /** El esperado y la diferencia del arqueo son de quien controla, no de quien cuenta. */
  veDiferencias: boolean;
  alCerrar: () => void;
}) {
  const nombre = useNombreOperador(catalogo);
  if (movimiento.clase === 'cobro' || movimiento.clase === 'sin_cobrar') {
    const cuenta = cuentas.get(movimiento.cuentaId);
    if (cuenta) return <DetalleCuenta cuenta={cuenta} cobroId={movimiento.clase === 'cobro' ? movimiento.id : null} catalogo={catalogo} operador={operador} alCerrar={alCerrar} />;
  }

  const quien = nombre(movimiento.operadorId);
  const titulo = { apertura: 'Apertura de caja', cierre: 'Cierre de caja', retiro: 'Retiro', egreso: 'Egreso', cobro: 'Cobro', sin_cobrar: 'Cuenta cerrada sin cobrar' }[movimiento.clase];
  const filas = movimiento.clase === 'cierre' ? arqueo(turno, catalogo.medios) : [];

  return (
    <Modal abierto alCerrar={alCerrar} titulo={titulo} descripcion={`${quien} · ${fechaHora(movimiento.momento)}`}>
      <div className="modal-cuerpo">
        {movimiento.clase === 'apertura' ? (
          <dl>
            <FilaDato etiqueta="Fondo inicial en efectivo">{pesosDesdeCentavos(movimiento.montoCentavos)}</FilaDato>
          </dl>
        ) : movimiento.clase === 'retiro' || movimiento.clase === 'egreso' ? (
          <dl>
            <FilaDato etiqueta="Importe">{pesosDesdeCentavos(-movimiento.montoCentavos)}</FilaDato>
            <FilaDato etiqueta="Motivo">{movimiento.motivo}</FilaDato>
            <FilaDato etiqueta="Tipo">{movimiento.clase === 'retiro' ? 'Retiro de efectivo' : 'Egreso (un gasto)'}</FilaDato>
          </dl>
        ) : movimiento.clase === 'cierre' ? (
          <Tabla>
            <thead>
              <tr>
                <Th>Medio</Th>
                {veDiferencias ? <Th className="text-right">Esperado</Th> : null}
                <Th className="text-right">Declarado</Th>
                {veDiferencias ? <Th className="text-right">Diferencia</Th> : null}
              </tr>
            </thead>
            <tbody>
              {filas
                .filter((f) => f.esperadoCentavos || f.declaradoCentavos)
                .map((f) => {
                  const diferencia = (f.declaradoCentavos ?? 0) - f.esperadoCentavos;
                  return (
                    <tr key={f.medioId}>
                      <Td>{f.nombre}</Td>
                      {veDiferencias ? <Td className="text-right tabular-nums text-tinta-suave">{pesosDesdeCentavos(f.esperadoCentavos)}</Td> : null}
                      <Td className="text-right tabular-nums">{pesosDesdeCentavos(f.declaradoCentavos ?? 0)}</Td>
                      {veDiferencias ? (
                        <Td className={cn('text-right tabular-nums', diferencia < 0 ? 'text-error' : diferencia > 0 ? 'text-alerta' : 'text-tinta-suave')}>{diferencia ? pesosDesdeCentavos(diferencia) : '—'}</Td>
                      ) : null}
                    </tr>
                  );
                })}
            </tbody>
          </Tabla>
        ) : (
          <Aviso tono="error">No encontramos la cuenta de este cobro en este dispositivo.</Aviso>
        )}
      </div>
    </Modal>
  );
}
