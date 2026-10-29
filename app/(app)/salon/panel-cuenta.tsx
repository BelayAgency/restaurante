'use client';

import { useState, useTransition } from 'react';
import { ArrowRightLeft, ChefHat, Combine, HandCoins, MoveRight, Percent, Plus, Printer, UserRound, X } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { Aviso, EstadoVacio, Insignia } from '@/components/ui';
import type { Catalogo } from '@/dominio/catalogo';
import { puede } from '@/dominio/permisos';
import { importeItem, totalCuenta, type Cuenta, type EstadoSalon, type Item } from '@/dominio/reductores/salon';
import { duracionCorta, minutosDesde, useAhora } from '@/lib/ahora';
import { pesosDesdeCentavos } from '@/lib/formato';
import { NOMBRE_SISTEMA } from '@/lib/marca';
import { AgregarItems } from './agregar-items';
import { nombreMesa, nombreOperador, useRegistrar, type Operador } from './contexto';
import { ModalCorregirItem, ModalDescuento } from './correcciones';
import { imprimirPrecuenta } from './imprimir-precuenta';

type Operacion = 'mover' | 'unir' | 'pasar' | 'mozo' | null;

function FilaItem({ item, alQuitar, alCorregir, seleccionable, seleccionado, alSeleccionar, listo }: {
  item: Item;
  listo?: boolean;
  alCorregir?: () => void;
  alQuitar?: () => void;
  seleccionable?: boolean;
  seleccionado?: boolean;
  alSeleccionar?: () => void;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-borde/60 py-2.5 last:border-0">
      {seleccionable ? (
        <input type="checkbox" checked={seleccionado} onChange={alSeleccionar} aria-label={`Elegir ${item.nombre}`} className="mt-1 accent-[var(--color-acento)]" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className={item.anulado ? 'text-sm text-tinta-tenue line-through' : 'text-sm text-tinta'}>
          <span className="tabular-nums">{item.cantidad} ×</span> {item.nombre}
          {item.anulado ? (
            <Insignia tono="error" className="ml-2">
              Anulado
            </Insignia>
          ) : null}
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
      <span className="text-right text-sm tabular-nums text-tinta">
        {item.precioOriginalCentavos !== null ? (
          <span className="block text-xs text-tinta-tenue line-through">{pesosDesdeCentavos(item.precioOriginalCentavos * item.cantidad)}</span>
        ) : null}
        {pesosDesdeCentavos(importeItem(item))}
      </span>
      {alCorregir && !item.anulado ? (
        <Boton variante="fantasma" tamano="sm" onClick={alCorregir}>
          Corregir
        </Boton>
      ) : null}
      {alQuitar ? (
        <Boton variante="fantasma" tamano="sm" soloIcono aria-label={`Quitar ${item.nombre}`} onClick={alQuitar}>
          <X size={14} strokeWidth={1.5} />
        </Boton>
      ) : null}
    </li>
  );
}

export function PanelCuenta({
  cuenta,
  estado,
  listos,
  catalogo,
  operador,
  alCerrar,
}: {
  cuenta: Cuenta;
  estado: EstadoSalon;
  /** Ítems que cocina ya marcó listos. */
  listos: Set<string>;
  catalogo: Catalogo;
  operador: Operador;
  alCerrar: () => void;
}) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const ahora = useAhora();
  const [agregando, setAgregando] = useState(false);
  const [operacion, setOperacion] = useState<Operacion>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [corrigiendo, setCorrigiendo] = useState<Item | null>(null);
  const [descontando, setDescontando] = useState(false);
  const [ocupado, iniciar] = useTransition();

  const items = [...cuenta.items.values()];
  const borradores = items.filter((i) => i.estado === 'borrador');
  const enviados = items.filter((i) => i.estado === 'enviado');
  const total = totalCuenta(cuenta);
  const titulo = cuenta.tipo === 'mesa' ? nombreMesa(catalogo, cuenta.mesaId) : cuenta.tipo === 'llevar' ? `Para llevar${cuenta.nombre ? ` · ${cuenta.nombre}` : ''}` : `Mostrador${cuenta.nombre ? ` · ${cuenta.nombre}` : ''}`;

  const otrasCuentas = [...estado.cuentas.values()].filter((c) => c.estado === 'abierta' && c.id !== cuenta.id);
  const ocupadas = new Set(otrasCuentas.map((c) => c.mesaId));
  const mesasLibres = catalogo.elementos.filter((e) => e.tipo === 'mesa' && !ocupadas.has(e.id) && e.id !== cuenta.mesaId);

  function hacer(accion: () => Promise<boolean>, exito?: string) {
    iniciar(async () => {
      if ((await accion()) && exito) toast.exito(exito);
    });
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

  function confirmarOperacion() {
    if (!destino && operacion !== 'pasar') return;
    if (operacion === 'mover' && destino) hacer(() => registrar('cuenta_movida', cuenta.id, { mesaDestinoId: destino }), 'Cuenta movida');
    if (operacion === 'unir' && destino) {
      // La cuenta elegida se suma a ésta: la de origen queda unida y deja de operarse.
      hacer(() => registrar('cuentas_unidas', cuenta.id, { cuentaOrigenId: destino }), 'Cuentas unidas');
    }
    if (operacion === 'pasar' && destino && elegidos.length) {
      hacer(() => registrar('items_transferidos', cuenta.id, { cuentaDestinoId: destino, itemIds: elegidos }), 'Ítems pasados');
    }
    if (operacion === 'mozo' && destino) hacer(() => registrar('mozo_cambiado', cuenta.id, { mozoId: destino }), 'Cambio de mozo registrado');
    setOperacion(null);
    setDestino(null);
    setElegidos([]);
  }

  const nombreCuenta = (c: Cuenta) => (c.tipo === 'mesa' ? nombreMesa(catalogo, c.mesaId) : c.nombre ?? (c.tipo === 'llevar' ? 'Para llevar' : 'Mostrador'));
  const opcionesOperacion = {
    mover: mesasLibres.map((m) => ({ valor: m.id, etiqueta: `Mesa ${m.numeroMesa}` })),
    unir: otrasCuentas.map((c) => ({ valor: c.id, etiqueta: nombreCuenta(c), detalle: pesosDesdeCentavos(totalCuenta(c)) })),
    pasar: otrasCuentas.map((c) => ({ valor: c.id, etiqueta: nombreCuenta(c) })),
    mozo: catalogo.operadores.filter((o) => puede(o, 'salon.operar') && o.id !== cuenta.mozoId).map((o) => ({ valor: o.id, etiqueta: o.nombre })),
  };
  const titulosOperacion = { mover: 'Mover a otra mesa', unir: 'Sumar otra cuenta a ésta', pasar: 'Pasar ítems a otra cuenta', mozo: 'Cambiar de mozo' };

  return (
    <>
      <Modal abierto={!agregando && operacion === null && !corrigiendo && !descontando} alCerrar={alCerrar} titulo={titulo}>
        <div className="modal-cuerpo flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-tinta-suave">
            <span className="inline-flex items-center gap-1">
              <UserRound size={14} strokeWidth={1.5} /> {nombreOperador(catalogo, cuenta.mozoId)}
            </span>
            <span>
              {cuenta.comensales} {cuenta.comensales === 1 ? 'comensal' : 'comensales'}
            </span>
            <span>Abierta hace {duracionCorta(minutosDesde(cuenta.abiertaEn, ahora))}</span>
            {cuenta.pidioCuenta ? <Insignia tono="alerta">Pidió la cuenta</Insignia> : null}
          </div>

          {cuenta.cambiosTrasPrecuenta > 0 ? (
            <Aviso tono="alerta">La cuenta cambió después de la precuenta. Queda registrado.</Aviso>
          ) : null}

          {items.length === 0 ? (
            <EstadoVacio titulo="Todavía no se cargó nada" />
          ) : (
            <>
              {borradores.length ? (
                <section>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-tinta-tenue">Sin enviar</p>
                  <ul>
                    {borradores.map((i) => (
                      <FilaItem key={i.id} item={i} alQuitar={() => hacer(() => registrar('item_quitado', cuenta.id, { itemId: i.id }))} />
                    ))}
                  </ul>
                </section>
              ) : null}
              {enviados.length ? (
                <section>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-tinta-tenue">En cocina</p>
                  <ul>
                    {enviados.map((i) => (
                      <FilaItem key={i.id} item={i} listo={listos.has(i.id)} alCorregir={() => setCorrigiendo(i)} />
                    ))}
                  </ul>
                </section>
              ) : null}
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

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Boton variante="secundario" tamano="sm" onClick={() => setOperacion('mover')} disabled={ocupado}>
              <MoveRight size={13} strokeWidth={1.5} /> Mover
            </Boton>
            <Boton variante="secundario" tamano="sm" onClick={() => setOperacion('unir')} disabled={ocupado || !otrasCuentas.length}>
              <Combine size={13} strokeWidth={1.5} /> Unir
            </Boton>
            <Boton variante="secundario" tamano="sm" onClick={() => setOperacion('pasar')} disabled={ocupado || !otrasCuentas.length || !items.length}>
              <ArrowRightLeft size={13} strokeWidth={1.5} /> Pasar ítems
            </Boton>
            <Boton variante="secundario" tamano="sm" onClick={() => setOperacion('mozo')} disabled={ocupado}>
              <UserRound size={13} strokeWidth={1.5} /> Mozo
            </Boton>
            <Boton variante="secundario" tamano="sm" onClick={() => setDescontando(true)} disabled={ocupado || total <= 0}>
              <Percent size={13} strokeWidth={1.5} /> Descuento
            </Boton>
          </div>
        </div>

        <footer className="modal-pie flex-wrap">
          <Boton variante="secundario" onClick={() => hacer(() => registrar('cuenta_pedida', cuenta.id, {}), 'Marcada: pidió la cuenta')} disabled={ocupado || cuenta.pidioCuenta || !items.length}>
            <HandCoins size={15} strokeWidth={1.5} /> Pidió la cuenta
          </Boton>
          <Boton variante="secundario" onClick={precuenta} disabled={ocupado || !items.length || borradores.length > 0}>
            <Printer size={15} strokeWidth={1.5} /> Precuenta
          </Boton>
          <Boton variante="secundario" onClick={() => setAgregando(true)} disabled={ocupado}>
            <Plus size={15} strokeWidth={1.5} /> Cargar
          </Boton>
          <Boton variante="primario" onClick={enviar} disabled={ocupado || !borradores.length}>
            <ChefHat size={15} strokeWidth={1.5} /> Enviar{borradores.length ? ` (${borradores.length})` : ''}
          </Boton>
        </footer>
      </Modal>

      {corrigiendo ? <ModalCorregirItem cuentaId={cuenta.id} item={corrigiendo} operador={operador} alCerrar={() => setCorrigiendo(null)} /> : null}
      {descontando ? <ModalDescuento cuenta={cuenta} operador={operador} alCerrar={() => setDescontando(false)} /> : null}
      {agregando ? <AgregarItems abierto alCerrar={() => setAgregando(false)} cuentaId={cuenta.id} catalogo={catalogo} operador={operador} /> : null}

      {operacion ? (
        <Modal abierto alCerrar={() => setOperacion(null)} titulo={titulosOperacion[operacion]}>
          <div className="modal-cuerpo flex flex-col gap-4">
            <Selector
              opciones={opcionesOperacion[operacion]}
              valor={destino}
              alElegir={setDestino}
              buscador
              placeholder={operacion === 'mover' ? 'Elegí la mesa' : operacion === 'mozo' ? 'Elegí quién atiende' : 'Elegí la cuenta'}
              vacio={operacion === 'mover' ? 'No hay mesas libres' : 'No hay otras cuentas abiertas'}
            />
            {operacion === 'pasar' ? (
              <ul>
                {items.map((i) => (
                  <FilaItem
                    key={i.id}
                    item={i}
                    seleccionable
                    seleccionado={elegidos.includes(i.id)}
                    alSeleccionar={() => setElegidos(elegidos.includes(i.id) ? elegidos.filter((x) => x !== i.id) : [...elegidos, i.id])}
                  />
                ))}
              </ul>
            ) : null}
          </div>
          <footer className="modal-pie">
            <Boton variante="secundario" onClick={() => setOperacion(null)}>
              Cancelar
            </Boton>
            <Boton variante="primario" onClick={confirmarOperacion} disabled={!destino || (operacion === 'pasar' && !elegidos.length)} cargando={ocupado}>
              Confirmar
            </Boton>
          </footer>
        </Modal>
      ) : null}
    </>
  );
}
