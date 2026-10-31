'use client';

import { useState, useTransition } from 'react';
import { Ban, ChefHat, CircleDollarSign, Clock, Gift, HandCoins, MoveRight, Plus, Printer, UserRound } from 'lucide-react';
import { Boton } from '@/components/boton';
import { MenuAcciones, type AccionMenu } from '@/components/menu-acciones';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { Aviso, EstadoVacio, Insignia } from '@/components/ui';
import type { Catalogo } from '@/dominio/catalogo';
import { puede } from '@/dominio/permisos';
import { importeItem, saldoCuenta, totalCuenta, type Cuenta, type Item } from '@/dominio/reductores/salon';
import { duracionCorta, minutosDesde, useAhora } from '@/lib/ahora';
import { cn } from '@/lib/cn';
import { hora, pesosDesdeCentavos } from '@/lib/formato';
import { NOMBRE_SISTEMA } from '@/lib/marca';
import { ModalCobro } from '../caja/modal-cobro';
import { AgregarItems } from './agregar-items';
import { nombreMesa, nombreOperador, useRegistrar, type Operador } from './contexto';
import { ModalCorregirItem } from './correcciones';
import { imprimirPrecuenta } from './imprimir-precuenta';

function FilaItem({ item, acciones, listo }: {
  item: Item;
  listo?: boolean;
  /** Lo que se le puede corregir a un ítem enviado, en su menú de tres puntos. */
  acciones?: AccionMenu[];
}) {
  return (
    // Lo anulado no se borra: queda tachado y apagado, para que se vea qué se sacó.
    <li className={cn('flex items-start gap-3 py-2', item.anulado && 'opacity-50')}>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm text-tinta', item.anulado && 'line-through')}>
          <span className="tabular-nums">{item.cantidad} ×</span> {item.nombre}
          {item.cortesia ? (
            <Insignia tono="acento" className="ml-2">
              Cortesía
            </Insignia>
          ) : null}
          {listo ? (
            <Insignia tono="exito" className="ml-2">
              Listo
            </Insignia>
          ) : null}
          {item.trasPrecuenta ? (
            <Insignia tono="alerta" className="ml-2">
              Después de la precuenta
            </Insignia>
          ) : null}
        </p>
        {item.modificadores.length ? <p className="text-xs text-tinta-tenue">{item.modificadores.map((m) => m.nombre).join(' · ')}</p> : null}
        {item.nota ? <p className="text-xs italic text-tinta-suave">«{item.nota}»</p> : null}
      </div>
      <span className={cn('text-right text-sm tabular-nums text-tinta', item.anulado && 'line-through')}>
        {item.precioOriginalCentavos !== null ? (
          <span className="block text-xs text-tinta-tenue line-through">{pesosDesdeCentavos(item.precioOriginalCentavos * item.cantidad)}</span>
        ) : null}
        {/* Anulado, se muestra lo que valía: en cero no se entendería qué se sacó. */}
        {pesosDesdeCentavos(importeItem(item.anulado ? { ...item, anulado: false } : item))}
      </span>
      {acciones && !item.anulado ? <MenuAcciones acciones={acciones} etiqueta={`Corregir ${item.nombre}`} /> : null}
    </li>
  );
}

export function PanelCuenta({
  cuenta,
  listos,
  catalogo,
  operador,
  turnoId,
  alMover,
  alCerrar,
}: {
  cuenta: Cuenta;
  /** Ítems que cocina ya marcó listos. */
  listos: Set<string>;
  catalogo: Catalogo;
  operador: Operador;
  /** El turno de caja abierto: sin caja abierta no se cobra. */
  turnoId: string | null;
  /** Mover se hace eligiendo la mesa en el plano: lo resuelve el salón. */
  alMover: () => void;
  alCerrar: () => void;
}) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const ahora = useAhora();
  // La orden sin enviar que se abre a editar, o `[]` para una nueva; `null` cerrado.
  const [agregando, setAgregando] = useState<Item[] | null>(null);
  const [cambiandoMozo, setCambiandoMozo] = useState(false);
  const [nuevoMozo, setNuevoMozo] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<{ item: Item; modo: 'anular' | 'cortesia' } | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [ocupado, iniciar] = useTransition();

  const items = [...cuenta.items.values()];
  const borradores = items.filter((i) => i.estado === 'borrador');
  // Cada orden va aparte, aunque dos se hayan mandado juntas; los ítems de antes de que hubiera
  // órdenes se agrupan por envío, que salen con la misma hora.
  const ordenes = new Map<string, Item[]>();
  for (const i of items) if (i.estado === 'enviado') ordenes.set(i.ordenId ?? i.enviadoEn ?? '', [...(ordenes.get(i.ordenId ?? i.enviadoEn ?? '') ?? []), i]);
  // Las que todavía no se mandaron, cada una aparte; las cargadas antes de que hubiera órdenes van juntas.
  const sinEnviar = new Map<string, Item[]>();
  for (const i of borradores) sinEnviar.set(i.ordenId ?? '', [...(sinEnviar.get(i.ordenId ?? '') ?? []), i]);
  const total = totalCuenta(cuenta);
  const saldo = saldoCuenta(cuenta);
  const puedeCobrar = puede(operador, 'caja.operar');
  const vacia = items.length === 0 && cuenta.pagadoCentavos === 0;
  const titulo = cuenta.tipo === 'mesa' ? nombreMesa(catalogo, cuenta.mesaId) : cuenta.tipo === 'llevar' ? `Para llevar${cuenta.nombre ? ` · ${cuenta.nombre}` : ''}` : `Mostrador${cuenta.nombre ? ` · ${cuenta.nombre}` : ''}`;


  function hacer(accion: () => Promise<boolean>, exito?: string) {
    iniciar(async () => {
      if ((await accion()) && exito) toast.exito(exito);
    });
  }

  // Anular y regalar van sin PIN: quedan auditados a nombre de quien lo hizo.
  const accionesDe = (item: Item): AccionMenu[] => [
    { texto: 'Anular', icono: <Ban size={15} strokeWidth={1.5} />, alElegir: () => (item.cantidad > 1 ? setCorrigiendo({ item, modo: 'anular' }) : hacer(() => registrar('item_anulado', cuenta.id, { itemId: item.id }), 'Ítem anulado')), deshabilitada: ocupado },
    { texto: 'Cortesía', icono: <Gift size={15} strokeWidth={1.5} />, alElegir: () => setCorrigiendo({ item, modo: 'cortesia' }), deshabilitada: ocupado || item.cortesia },
  ];

  async function cerrarVacia() {
    const ok = await registrar('cuenta_cerrada', cuenta.id, {});
    if (ok) alCerrar();
    return ok;
  }

  function enviar() {
    hacer(() => registrar('items_enviados', cuenta.id, { envioId: crypto.randomUUID(), itemIds: borradores.map((i) => i.id) }), 'Comanda enviada');
  }

  function precuenta() {
    iniciar(async () => {
      const ok = await registrar('precuenta_emitida', cuenta.id, { precuentaId: crypto.randomUUID(), totalCentavos: total });
      if (!ok) return;
      const impresa = imprimirPrecuenta(cuenta, { local: NOMBRE_SISTEMA, mesa: titulo, mozo: nombreOperador(catalogo, cuenta.mozoId) });
      if (!impresa) toast.alerta('Precuenta registrada', 'El navegador bloqueó la ventana de impresión.');
    });
  }

  function cambiarMozo() {
    if (!nuevoMozo) return;
    hacer(() => registrar('mozo_cambiado', cuenta.id, { mozoId: nuevoMozo }), 'Cambio de mozo registrado');
    setCambiandoMozo(false);
    setNuevoMozo(null);
  }

  const mozos = catalogo.operadores.filter((o) => puede(o, 'salon.operar') && o.id !== cuenta.mozoId).map((o) => ({ valor: o.id, etiqueta: o.nombre }));

  return (
    <>
      <Modal
        // Queda abierto debajo de los modales que se abren desde acá (orden, cobro, mozo…): esos se apilan encima.
        abierto
        alCerrar={alCerrar}
        titulo={titulo}
        lateral
        acciones={
          <MenuAcciones
            acciones={[
              { texto: 'Precuenta', icono: <Printer size={15} strokeWidth={1.5} />, alElegir: precuenta, deshabilitada: ocupado || !items.length || borradores.length > 0 },
              // Ya no se marca a mano; sólo se ofrece sacar la marca a las mesas que la tenían de antes.
              ...(cuenta.pidioCuenta
                ? [{ texto: 'Ya no pide la cuenta', icono: <HandCoins size={15} strokeWidth={1.5} />, alElegir: () => hacer(() => registrar('cuenta_pedida_cancelada', cuenta.id, {}), 'Marca de cuenta pedida sacada'), deshabilitada: ocupado }]
                : []),
              { texto: 'Mover a otra mesa', icono: <MoveRight size={15} strokeWidth={1.5} />, alElegir: alMover, deshabilitada: ocupado },
              { texto: 'Cambiar de mozo', icono: <UserRound size={15} strokeWidth={1.5} />, alElegir: () => setCambiandoMozo(true), deshabilitada: ocupado },
            ]}
          />
        }
      >
        <div className="modal-cuerpo flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-tinta-suave">
            <span className="inline-flex items-center gap-1">
              <UserRound size={14} strokeWidth={1.5} /> {nombreOperador(catalogo, cuenta.mozoId)}
            </span>
            {cuenta.comensales ? (
              <span>
                {cuenta.comensales} {cuenta.comensales === 1 ? 'comensal' : 'comensales'}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 text-xs tabular-nums text-tinta-tenue">
              <Clock size={12} strokeWidth={1.5} /> {duracionCorta(minutosDesde(cuenta.abiertaEn, ahora))}
            </span>
            {cuenta.pidioCuenta ? <Insignia tono="alerta">Pidió la cuenta</Insignia> : null}
          </div>

          {cuenta.cambiosTrasPrecuenta > 0 ? (
            <Aviso tono="alerta">La cuenta cambió después de la precuenta. Queda registrado.</Aviso>
          ) : null}

          {items.length === 0 ? (
            <EstadoVacio titulo="Todavía no se cargó nada" />
          ) : (
            <>
              {[...ordenes].map(([clave, lineas], n) => (
                <section key={clave}>
                  <p className="mb-1 flex items-baseline justify-between text-xs font-medium text-tinta-tenue">
                    <span className="uppercase tracking-wide">Orden {n + 1}</span>
                    {lineas[0]?.enviadoEn ? <span className="tabular-nums">{hora(lineas[0].enviadoEn)}</span> : null}
                  </p>
                  <ul>
                    {lineas.map((i) => (
                      <FilaItem key={i.id} item={i} listo={listos.has(i.id)} acciones={accionesDe(i)} />
                    ))}
                  </ul>
                </section>
              ))}
              {[...sinEnviar].map(([clave, lineas], n) => (
                // Cada orden sin enviar se toca entera y se sigue armando en su modal:
                // desde acá no se le saca nada suelto.
                // Sin botón propio: con el teclado se abre igual, por eso el role y el Enter.
                <section
                  key={clave}
                  role="button"
                  tabIndex={0}
                  aria-label={`Editar la orden ${ordenes.size + n + 1}, sin enviar`}
                  onClick={() => !ocupado && setAgregando(lineas)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !ocupado) {
                      e.preventDefault();
                      setAgregando(lineas);
                    }
                  }}
                  className="cursor-pointer rounded-xl border border-dashed border-borde px-3 pt-2 outline-none transition-colors hover:border-acento hover:bg-fill-fantasma-hover focus-visible:shadow-foco"
                >
                  <p className="mb-1 py-1 text-xs font-medium uppercase tracking-wide text-acento">Orden {ordenes.size + n + 1} · sin enviar</p>
                  <ul>
                    {lineas.map((i) => (
                      <FilaItem key={i.id} item={i} />
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}

          {cuenta.descuentos.map((d) => (
            <div key={d.id} className="flex items-baseline justify-between text-sm">
              <span className="text-tinta-suave">Descuento{d.porcentaje !== null ? ` ${d.porcentaje} %` : ''}</span>
              <span className="tabular-nums text-tinta">− {pesosDesdeCentavos(d.montoCentavos)}</span>
            </div>
          ))}

          <div className="flex items-baseline justify-between border-t border-borde pt-3">
            <span className="text-sm text-tinta-suave">Total</span>
            <span className="text-xl font-semibold tabular-nums text-tinta">{pesosDesdeCentavos(total)}</span>
          </div>
          {cuenta.pagadoCentavos > 0 ? (
            <div className="-mt-2 flex items-baseline justify-between text-sm">
              <span className="text-tinta-suave">Falta cobrar</span>
              <span className="tabular-nums text-tinta">{pesosDesdeCentavos(saldo)}</span>
            </div>
          ) : null}
        </div>

        <footer className="modal-pie flex-col items-stretch gap-2">
          {/* Apilados y del mismo alto, para el dedo. Mientras hay una orden sin enviar, lo primero es mandarla: después se cobra. */}
          <Boton variante="secundario" tamano="lg" ancho onClick={() => setAgregando([])} disabled={ocupado}>
            <Plus size={15} strokeWidth={1.5} /> Añadir orden
          </Boton>
          <Boton variante={borradores.length ? 'primario' : 'secundario'} tamano="lg" ancho onClick={enviar} disabled={ocupado || !borradores.length}>
            <ChefHat size={15} strokeWidth={1.5} /> Enviar{borradores.length ? ` (${borradores.length})` : ''}
          </Boton>
          {/* Sin nada cargado no hay qué cobrar: el mismo botón la cierra, sin caja ni autorización (no se cierra nada adeudado). */}
          {puedeCobrar && vacia ? (
            <Boton variante="primario" tamano="lg" ancho onClick={() => hacer(cerrarVacia, 'Cuenta cerrada')} disabled={ocupado}>
              <CircleDollarSign size={15} strokeWidth={1.5} /> Cerrar cuenta
            </Boton>
          ) : puedeCobrar ? (
            <Boton variante={borradores.length ? 'secundario' : 'primario'} tamano="lg" ancho onClick={() => setCobrando(true)} disabled={ocupado || !turnoId || saldo <= 0}>
              <CircleDollarSign size={15} strokeWidth={1.5} /> {turnoId ? `Cobrar ${saldo > 0 ? pesosDesdeCentavos(saldo) : ''}` : 'Cobrar · la caja está cerrada'}
            </Boton>
          ) : null}
        </footer>
      </Modal>

      {corrigiendo ? <ModalCorregirItem cuentaId={cuenta.id} item={corrigiendo.item} modo={corrigiendo.modo} operador={operador} alCerrar={() => setCorrigiendo(null)} /> : null}
      {cobrando && turnoId ? (
        <ModalCobro cuenta={cuenta} turnoId={turnoId} medios={catalogo.medios} operador={operador} divisionInicial="total" alCerrar={() => setCobrando(false)} />
      ) : null}
      {agregando ? <AgregarItems abierto alCerrar={() => setAgregando(null)} cuentaId={cuenta.id} catalogo={catalogo} operador={operador} sinEnviar={agregando} /> : null}

      {cambiandoMozo ? (
        <Modal abierto alCerrar={() => setCambiandoMozo(false)} titulo="Cambiar de mozo">
          <div className="modal-cuerpo">
            <Selector opciones={mozos} valor={nuevoMozo} alElegir={setNuevoMozo} buscador placeholder="Elegí quién atiende" vacio="No hay nadie más que atienda" />
          </div>
          <footer className="modal-pie">
            <Boton variante="secundario" onClick={() => setCambiandoMozo(false)}>
              Cancelar
            </Boton>
            <Boton variante="primario" onClick={cambiarMozo} disabled={!nuevoMozo} cargando={ocupado}>
              Confirmar
            </Boton>
          </footer>
        </Modal>
      ) : null}
    </>
  );
}
