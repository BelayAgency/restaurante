'use client';

import { useState, useTransition } from 'react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { Tabs } from '@/components/tabs';
import { useToast } from '@/components/toast';
import { NOMBRE_UNIDAD } from '@/dominio/stock';
import { numeroDesdeTexto } from '@/lib/formato';
import type { Stock } from '@/servidor/stock';
import { accionGuardarProveedor, accionRegistrarProduccion, accionRegistrarSalida, accionTransferir } from './acciones';

export type Movimiento = 'produccion' | 'transferencia' | 'baja' | 'proveedor';

type TipoBaja = 'merma' | 'vencimiento' | 'comida_personal';

const TITULO: Record<Movimiento, string> = {
  produccion: 'Registrar producción',
  transferencia: 'Pasar entre depósitos',
  baja: 'Dar de baja',
  proveedor: 'Nuevo proveedor',
};

export function ModalMovimiento({ tipo, stock, alCerrar }: { tipo: Movimiento; stock: Stock; alCerrar: () => void }) {
  const toast = useToast();
  const [insumoId, setInsumoId] = useState<string | null>(null);
  const [depositoId, setDepositoId] = useState<string | null>(stock.depositos.find((d) => d.deVenta)?.id ?? null);
  const [haciaId, setHaciaId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [baja, setBaja] = useState<TipoBaja>('merma');
  const [motivo, setMotivo] = useState('');
  const [nombre, setNombre] = useState('');
  const [cuit, setCuit] = useState('');
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  const opcionesInsumo = stock.insumos
    .filter((i) => (tipo === 'produccion' ? i.tipo === 'preparacion' : true))
    .map((i) => ({ valor: i.id, etiqueta: i.nombre, detalle: NOMBRE_UNIDAD[i.unidad] }));
  const opcionesDeposito = stock.depositos.map((d) => ({ valor: d.id, etiqueta: d.nombre }));
  const unidad = stock.insumos.find((i) => i.id === insumoId)?.unidad;

  function guardar() {
    const valor = numeroDesdeTexto(cantidad || '0') ?? 0;
    iniciar(async () => {
      const resultado =
        tipo === 'produccion'
          ? await accionRegistrarProduccion({ preparacionId: insumoId, cantidad: valor, depositoId })
          : tipo === 'transferencia'
            ? await accionTransferir({ insumoId, desdeId: depositoId, haciaId, cantidad: valor })
            : tipo === 'baja'
              ? await accionRegistrarSalida({ tipo: baja, insumoId, depositoId, cantidad: valor, motivo })
              : await accionGuardarProveedor({ id: null, nombre, cuit: cuit.trim() || null });
      if (!resultado.ok) return setError(resultado.error);
      toast.exito('Registrado');
      alCerrar();
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo={TITULO[tipo]}>
      <div className="modal-cuerpo flex flex-col gap-4">
        {tipo === 'proveedor' ? (
          <>
            <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required data-foco-inicial />
            <Campo etiqueta="CUIT (opcional)" value={cuit} onChange={(e) => setCuit(e.target.value)} inputMode="numeric" />
          </>
        ) : (
          <>
            {tipo === 'baja' ? (
              <Tabs
                etiqueta="Tipo de baja"
                valor={baja}
                alCambiar={(v) => setBaja(v as TipoBaja)}
                opciones={[
                  { valor: 'merma', etiqueta: 'Merma' },
                  { valor: 'vencimiento', etiqueta: 'Vencimiento' },
                  { valor: 'comida_personal', etiqueta: 'Comida del personal' },
                ]}
              />
            ) : null}
            <div>
              <label className="etiqueta-campo">{tipo === 'produccion' ? 'Preparación' : 'Insumo'}</label>
              <Selector opciones={opcionesInsumo} valor={insumoId} alElegir={setInsumoId} buscador vacio={tipo === 'produccion' ? 'No hay preparaciones' : 'No hay insumos'} />
            </div>
            <div className={tipo === 'transferencia' ? 'grid gap-4 sm:grid-cols-2' : undefined}>
              <div>
                <label className="etiqueta-campo">{tipo === 'transferencia' ? 'Desde' : 'Depósito'}</label>
                <Selector opciones={opcionesDeposito} valor={depositoId} alElegir={setDepositoId} />
              </div>
              {tipo === 'transferencia' ? (
                <div>
                  <label className="etiqueta-campo">Hacia</label>
                  <Selector opciones={opcionesDeposito} valor={haciaId} alElegir={setHaciaId} />
                </div>
              ) : null}
            </div>
            <CampoNumero etiqueta={`Cantidad${unidad ? ` (${NOMBRE_UNIDAD[unidad]})` : ''}`} valor={cantidad} alCambiar={setCantidad} decimales={3} placeholder="0" />
            {tipo === 'baja' ? <Campo etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={140} required /> : null}
          </>
        )}
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={guardar} cargando={guardando}>
          Guardar
        </Boton>
      </footer>
    </Modal>
  );
}
