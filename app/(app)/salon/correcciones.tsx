'use client';

import { useState, useTransition } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import type { Item } from '@/dominio/reductores/salon';
import { useRegistrar, type Operador } from './contexto';

/**
 * Anular o regalar un ítem ya enviado. Con más de una unidad se elige cuántas;
 * regalar además se confirma. Nada se borra: esas unidades quedan como su
 * propia línea al lado, tachada o en cero, con quién lo hizo.
 */
export function ModalCorregirItem({
  cuentaId,
  item,
  modo,
  operador,
  alCerrar,
}: {
  cuentaId: string;
  item: Item;
  modo: 'anular' | 'cortesia';
  operador: Operador;
  alCerrar: () => void;
}) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [cantidad, setCantidad] = useState(item.cantidad > 1 && modo === 'anular' ? 1 : item.cantidad);
  const [ocupado, iniciar] = useTransition();
  const regalar = modo === 'cortesia';
  const todos = cantidad === item.cantidad;

  function confirmar() {
    iniciar(async () => {
      // Sin cantidad, el evento toma el ítem entero.
      const datos = { itemId: item.id, ...(todos ? {} : { cantidad }) };
      const ok = await registrar(regalar ? 'item_cortesia' : 'item_anulado', cuentaId, datos);
      if (!ok) return;
      toast.exito(regalar ? 'Cortesía registrada' : todos ? 'Ítem anulado' : 'Cantidad anulada');
      alCerrar();
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo={regalar ? `¿Regalar ${item.nombre}?` : `Anular · ${item.nombre}`}>
      <div className="modal-cuerpo flex flex-col gap-3">
        {item.cantidad > 1 ? (
          <div>
            <p className="etiqueta-campo">
              ¿Cuántos se {regalar ? 'regalan' : 'anulan'}? Hay {item.cantidad}.
            </p>
            <div className="flex items-center gap-3">
              <Boton variante="secundario" tamano="lg" soloIcono aria-label="Uno menos" onClick={() => setCantidad(Math.max(1, cantidad - 1))} disabled={cantidad <= 1}>
                <Minus size={18} strokeWidth={1.5} />
              </Boton>
              <span className="w-10 text-center text-2xl font-semibold tabular-nums text-tinta" aria-live="polite">
                {cantidad}
              </span>
              <Boton variante="secundario" tamano="lg" soloIcono aria-label="Uno más" onClick={() => setCantidad(Math.min(item.cantidad, cantidad + 1))} disabled={todos}>
                <Plus size={18} strokeWidth={1.5} />
              </Boton>
              <Boton variante="fantasma" tamano="sm" onClick={() => setCantidad(item.cantidad)} disabled={todos}>
                Todos
              </Boton>
            </div>
          </div>
        ) : null}
        <p className="text-sm text-tinta-tenue">
          {regalar
            ? `${cantidad} × ${item.nombre} ${cantidad === 1 ? 'queda' : 'quedan'} en la cuenta en $ 0, como cortesía a tu nombre.`
            : todos
              ? 'Se anula el plato entero; queda tachado en la cuenta.'
              : `Quedan ${item.cantidad - cantidad}; lo anulado queda tachado en la cuenta.`}
        </p>
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={ocupado}>
          Cancelar
        </Boton>
        <Boton variante={regalar ? 'primario' : 'peligro'} cargando={ocupado} onClick={confirmar}>
          {regalar ? `Sí, regalar ${cantidad}` : `Anular ${cantidad}`}
        </Boton>
      </footer>
    </Modal>
  );
}
