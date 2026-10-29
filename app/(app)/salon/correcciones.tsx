'use client';

import { useState, useTransition } from 'react';
import { Ban, Gift, Tag } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { Tabs } from '@/components/tabs';
import { useToast } from '@/components/toast';
import { totalCuenta, type Cuenta, type Item } from '@/dominio/reductores/salon';
import { centavosDesdeTexto, numeroDesdeTexto, pesosDesdeCentavos, textoDesdeCentavos } from '@/lib/formato';
import { useRegistrar, type Operador } from './contexto';

/**
 * Lo que se le puede hacer a un ítem ya enviado. Nada lo borra: queda en la
 * cuenta, tachado o en cero, con quién lo hizo, quién lo autorizó y por qué.
 */
export function ModalCorregirItem({ cuentaId, item, operador, alCerrar }: { cuentaId: string; item: Item; operador: Operador; alCerrar: () => void }) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [cambiandoPrecio, setCambiandoPrecio] = useState(false);
  const [precio, setPrecio] = useState(textoDesdeCentavos(item.precioCentavos));
  const [ocupado, iniciar] = useTransition();

  function hacer(accion: () => Promise<boolean>, exito: string) {
    iniciar(async () => {
      if (await accion()) {
        toast.exito(exito);
        alCerrar();
      }
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo={`${item.cantidad} × ${item.nombre}`} descripcion="Cualquiera de estas acciones pide la autorización de un encargado.">
      <div className="modal-cuerpo flex flex-col gap-3">
        {cambiandoPrecio ? (
          <CampoNumero etiqueta="Precio unitario" valor={precio} alCambiar={setPrecio} decimales={2} prefijo="$" placeholder="0" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            <Boton variante="secundario" onClick={() => hacer(() => registrar('item_anulado', cuentaId, { itemId: item.id }), 'Ítem anulado')} disabled={ocupado}>
              <Ban size={15} strokeWidth={1.5} /> Anular
            </Boton>
            <Boton variante="secundario" onClick={() => hacer(() => registrar('item_cortesia', cuentaId, { itemId: item.id }), 'Cortesía registrada')} disabled={ocupado || item.cortesia}>
              <Gift size={15} strokeWidth={1.5} /> Cortesía
            </Boton>
            <Boton variante="secundario" onClick={() => setCambiandoPrecio(true)} disabled={ocupado}>
              <Tag size={15} strokeWidth={1.5} /> Precio
            </Boton>
          </div>
        )}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={ocupado}>
          Cancelar
        </Boton>
        {cambiandoPrecio ? (
          <Boton
            variante="primario"
            cargando={ocupado}
            onClick={() => {
              const precioCentavos = centavosDesdeTexto(precio || '0');
              if (precioCentavos === null) return;
              hacer(() => registrar('precio_modificado', cuentaId, { itemId: item.id, precioCentavos }), 'Precio cambiado');
            }}
          >
            Cambiar precio
          </Boton>
        ) : null}
      </footer>
    </Modal>
  );
}

export function ModalDescuento({ cuenta, operador, alCerrar }: { cuenta: Cuenta; operador: Operador; alCerrar: () => void }) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [modo, setModo] = useState<'porcentaje' | 'monto'>('porcentaje');
  const [valor, setValor] = useState('');
  const [ocupado, iniciar] = useTransition();
  const total = totalCuenta(cuenta);
  const porcentaje = modo === 'porcentaje' ? Math.min(100, numeroDesdeTexto(valor || '0') ?? 0) : null;
  const montoCentavos = modo === 'porcentaje' ? Math.round((total * (porcentaje ?? 0)) / 100) : Math.min(total, centavosDesdeTexto(valor || '0') ?? 0);

  function aplicar() {
    if (montoCentavos <= 0) return;
    iniciar(async () => {
      if (await registrar('descuento_aplicado', cuenta.id, { descuentoId: crypto.randomUUID(), porcentaje, montoCentavos })) {
        toast.exito('Descuento aplicado');
        alCerrar();
      }
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Descuento" descripcion={`Sobre ${pesosDesdeCentavos(total)}. Pide la autorización de un encargado.`}>
      <div className="modal-cuerpo flex flex-col gap-4">
        <Tabs
          etiqueta="Tipo de descuento"
          valor={modo}
          alCambiar={(v) => {
            setModo(v as 'porcentaje' | 'monto');
            setValor('');
          }}
          opciones={[
            { valor: 'porcentaje', etiqueta: 'Porcentaje' },
            { valor: 'monto', etiqueta: 'Monto fijo' },
          ]}
        />
        <CampoNumero etiqueta={modo === 'porcentaje' ? 'Porcentaje' : 'Monto'} valor={valor} alCambiar={setValor} decimales={modo === 'porcentaje' ? 1 : 2} prefijo={modo === 'porcentaje' ? '%' : '$'} placeholder="0" />
        <p className="text-sm text-tinta-suave">
          Se descuentan <strong className="tabular-nums text-tinta">{pesosDesdeCentavos(montoCentavos)}</strong>
        </p>
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={ocupado}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={aplicar} cargando={ocupado} disabled={montoCentavos <= 0}>
          Aplicar
        </Boton>
      </footer>
    </Modal>
  );
}
