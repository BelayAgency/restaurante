'use client';

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { NOMBRE_UNIDAD, type UnidadBase } from '@/dominio/stock';
import { numeroDesdeTexto, textoDesdeNumero } from '@/lib/formato';
import type { Stock } from '@/servidor/stock';
import { accionArchivarInsumo, accionGuardarInsumo } from './acciones';

type Insumo = Stock['insumos'][number];

const UNIDADES: { valor: UnidadBase; etiqueta: string }[] = [
  { valor: 'g', etiqueta: 'Gramos (g)' },
  { valor: 'ml', etiqueta: 'Mililitros (ml)' },
  { valor: 'u', etiqueta: 'Unidades' },
];

export function ModalInsumo({ insumo, alCerrar }: { insumo: Insumo | null; alCerrar: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState(insumo?.nombre ?? '');
  const [tipo, setTipo] = useState<'compra' | 'preparacion'>(insumo?.tipo ?? 'compra');
  const [unidad, setUnidad] = useState<UnidadBase | null>(insumo?.unidad ?? null);
  const [minimo, setMinimo] = useState(insumo ? textoDesdeNumero(insumo.stockMinimo) : '');
  const [presentaciones, setPresentaciones] = useState(
    insumo?.presentaciones.map((p) => ({ clave: p.id, id: p.id as string | null, nombre: p.nombre, cantidad: textoDesdeNumero(p.cantidadBase) })) ?? [],
  );
  const [confirmandoArchivo, setConfirmandoArchivo] = useState(false);
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  function guardar() {
    if (!unidad) return setError('Elegí la unidad');
    iniciar(async () => {
      const resultado = await accionGuardarInsumo({
        id: insumo?.id ?? null,
        nombre,
        tipo,
        unidad,
        stockMinimo: numeroDesdeTexto(minimo || '0') ?? 0,
        presentaciones: presentaciones.map((p) => ({ id: p.id, nombre: p.nombre, cantidadBase: numeroDesdeTexto(p.cantidad || '0') ?? 0 })),
      });
      if (!resultado.ok) return setError(resultado.error);
      toast.exito('Insumo guardado');
      alCerrar();
    });
  }

  function archivar() {
    if (!insumo) return;
    iniciar(async () => {
      const resultado = await accionArchivarInsumo(insumo.id);
      if (!resultado.ok) {
        setConfirmandoArchivo(false);
        return toast.error(resultado.error);
      }
      toast.exito('Insumo archivado');
      alCerrar();
    });
  }

  return (
    <>
      <Modal abierto alCerrar={alCerrar} titulo={insumo ? insumo.nombre : 'Nuevo insumo'}>
        <div className="modal-cuerpo flex flex-col gap-4">
          <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required data-foco-inicial />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="etiqueta-campo">Se usa en</label>
              {insumo ? (
                <p className="text-sm text-tinta">{UNIDADES.find((u) => u.valor === unidad)?.etiqueta}</p>
              ) : (
                <Selector opciones={UNIDADES} valor={unidad} alElegir={(v) => setUnidad(v as UnidadBase)} />
              )}
            </div>
            <div>
              <label className="etiqueta-campo">Tipo</label>
              {insumo ? (
                <p className="text-sm text-tinta">{tipo === 'compra' ? 'Se compra' : 'Se elabora (preparación)'}</p>
              ) : (
                <Selector
                  opciones={[
                    { valor: 'compra', etiqueta: 'Se compra' },
                    { valor: 'preparacion', etiqueta: 'Se elabora (salsa, masa, fondo)' },
                  ]}
                  valor={tipo}
                  alElegir={(v) => setTipo(v as 'compra' | 'preparacion')}
                />
              )}
            </div>
          </div>
          <CampoNumero etiqueta={`Stock mínimo${unidad ? ` (${NOMBRE_UNIDAD[unidad]})` : ''}`} valor={minimo} alCambiar={setMinimo} decimales={3} placeholder="0" />
          {tipo === 'compra' ? (
            <div>
              <p className="etiqueta-campo">Cómo se compra</p>
              <div className="flex flex-col gap-2">
                {presentaciones.map((p) => (
                  <div key={p.clave} className="flex items-center gap-2">
                    <input
                      className="campo min-w-0 flex-1"
                      aria-label="Presentación"
                      placeholder="Presentación"
                      value={p.nombre}
                      onChange={(e) => setPresentaciones(presentaciones.map((x) => (x.clave === p.clave ? { ...x, nombre: e.target.value } : x)))}
                    />
                    <NumeroInline
                      etiqueta={`Equivale a (${unidad ? NOMBRE_UNIDAD[unidad] : 'unidad'})`}
                      valor={p.cantidad}
                      alCambiar={(cantidad) => setPresentaciones(presentaciones.map((x) => (x.clave === p.clave ? { ...x, cantidad } : x)))}
                      decimales={3}
                      className="w-28"
                    />
                    <span className="text-xs text-tinta-tenue">{unidad ? NOMBRE_UNIDAD[unidad] : ''}</span>
                    <Boton variante="fantasma" tamano="sm" soloIcono aria-label="Quitar presentación" onClick={() => setPresentaciones(presentaciones.filter((x) => x.clave !== p.clave))}>
                      <X size={14} strokeWidth={1.5} />
                    </Boton>
                  </div>
                ))}
              </div>
              <Boton
                variante="fantasma"
                tamano="sm"
                className="mt-2"
                onClick={() => setPresentaciones([...presentaciones, { clave: crypto.randomUUID(), id: null, nombre: '', cantidad: '' }])}
              >
                <Plus size={14} strokeWidth={1.5} /> Presentación
              </Boton>
            </div>
          ) : null}
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <footer className="modal-pie justify-between">
          {insumo ? (
            <Boton variante="peligro" onClick={() => setConfirmandoArchivo(true)} disabled={guardando}>
              Archivar
            </Boton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton variante="primario" onClick={guardar} cargando={guardando}>
              Guardar
            </Boton>
          </div>
        </footer>
      </Modal>
      <Modal abierto={confirmandoArchivo} alCerrar={() => setConfirmandoArchivo(false)} titulo="Archivar insumo">
        <div className="modal-cuerpo">
          <p className="text-sm text-tinta-suave">Deja de aparecer en el stock. Sus movimientos quedan.</p>
        </div>
        <div className="modal-pie">
          <Boton variante="secundario" onClick={() => setConfirmandoArchivo(false)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={archivar} cargando={guardando}>
            Archivar
          </Boton>
        </div>
      </Modal>
    </>
  );
}
