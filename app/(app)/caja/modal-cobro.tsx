'use client';

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { Boton } from '@/components/boton';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { Selector } from '@/components/selector';
import { PanelTab, Tabs } from '@/components/tabs';
import { useToast } from '@/components/toast';
import type { MedioPago } from '@/dominio/catalogo';
import { importeItem, saldoCuenta, type Cuenta } from '@/dominio/reductores/salon';
import { centavosDesdeTexto, pesosDesdeCentavos, textoDesdeCentavos } from '@/lib/formato';
import { useRegistrar, type Operador } from '../salon/contexto';

type Division = 'total' | 'partes' | 'items';

interface FilaPago {
  clave: string;
  medioId: string | null;
  monto: string;
}

/**
 * Cobrar una cuenta entera o una parte: en partes iguales, o los ítems de
 * alguien. La propina va aparte del consumo. Si el cobro salda la cuenta, se
 * cierra y la mesa queda libre.
 */
export function ModalCobro({
  cuenta,
  turnoId,
  medios,
  operador,
  divisionInicial,
  alCerrar,
}: {
  cuenta: Cuenta;
  turnoId: string;
  medios: MedioPago[];
  operador: Operador;
  divisionInicial: Division;
  alCerrar: () => void;
}) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const saldo = saldoCuenta(cuenta);
  const efectivo = medios.find((m) => m.efectivo) ?? medios[0];
  const [division, setDivision] = useState<Division>(divisionInicial);
  const [partes, setPartes] = useState(2);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [propina, setPropina] = useState('');
  const [pagos, setPagos] = useState<FilaPago[]>([{ clave: crypto.randomUUID(), medioId: efectivo?.id ?? null, monto: '' }]);
  const [recibido, setRecibido] = useState('');
  const [error, setError] = useState<string>();
  const [cobrando, iniciar] = useTransition();

  const pendientes = [...cuenta.items.values()].filter((i) => !cuenta.itemsPagados.has(i.id));
  const consumo =
    division === 'total'
      ? saldo
      : division === 'partes'
        ? // Se redondea para arriba: la última parte paga lo que quede.
          Math.ceil(saldo / Math.max(1, partes))
        : Math.min(saldo, pendientes.filter((i) => elegidos.includes(i.id)).reduce((s, i) => s + importeItem(i), 0));
  const propinaCentavos = centavosDesdeTexto(propina || '0') ?? 0;
  const aCobrar = consumo + propinaCentavos;
  const montos = pagos.map((p) => (pagos.length === 1 && !p.monto ? aCobrar : (centavosDesdeTexto(p.monto || '0') ?? 0)));
  const sumaPagos = montos.reduce((s, m) => s + m, 0);
  const enEfectivo = pagos.reduce((s, p, i) => s + (medios.find((m) => m.id === p.medioId)?.efectivo ? montos[i]! : 0), 0);
  const recibidoCentavos = centavosDesdeTexto(recibido || '0') ?? 0;

  function cobrar() {
    if (consumo <= 0) return setError('No hay nada para cobrar');
    if (pagos.some((p) => !p.medioId)) return setError('Elegí el medio de cada pago');
    if (sumaPagos !== aCobrar) return setError(`Los pagos suman ${pesosDesdeCentavos(sumaPagos)} y hay que cobrar ${pesosDesdeCentavos(aCobrar)}`);
    iniciar(async () => {
      const ok = await registrar('cobro_registrado', cuenta.id, {
        cobroId: crypto.randomUUID(),
        turnoId,
        division,
        consumoCentavos: consumo,
        propinaCentavos,
        itemIds: division === 'items' ? elegidos : [],
        pagos: pagos.map((p, i) => {
          const medio = medios.find((m) => m.id === p.medioId)!;
          return { medioId: medio.id, nombre: medio.nombre, efectivo: medio.efectivo, montoCentavos: montos[i]! };
        }),
      });
      if (!ok) return;
      if (consumo === saldo) {
        await registrar('cuenta_cerrada', cuenta.id, {});
        toast.exito('Cuenta cobrada y cerrada');
      } else {
        toast.exito('Cobro registrado', `Queda ${pesosDesdeCentavos(saldo - consumo)}.`);
      }
      alCerrar();
    });
  }

  const opcionesMedio = medios.map((m) => ({ valor: m.id, etiqueta: m.nombre }));

  return (
    <Modal abierto alCerrar={alCerrar} titulo={`Cobrar · saldo ${pesosDesdeCentavos(saldo)}`}>
      <div className="modal-cuerpo flex flex-col gap-4">
        <Tabs
          etiqueta="Cómo se divide"
          valor={division}
          alCambiar={(v) => setDivision(v as Division)}
          opciones={[
            { valor: 'total', etiqueta: 'Todo' },
            { valor: 'partes', etiqueta: 'En partes' },
            { valor: 'items', etiqueta: 'Por ítem' },
          ]}
        />
        <PanelTab valor="partes" activo={division}>
          <div className="flex items-center gap-3">
            <span className="text-sm text-tinta-suave">Dividir lo que queda entre</span>
            <input
              className="campo w-20 text-center"
              inputMode="numeric"
              aria-label="Cantidad de partes"
              value={partes}
              onChange={(e) => setPartes(Math.min(30, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)))}
            />
            <span className="text-sm text-tinta-suave">· esta parte: {pesosDesdeCentavos(consumo)}</span>
          </div>
        </PanelTab>
        <PanelTab valor="items" activo={division}>
          <ul className="max-h-48 overflow-y-auto">
            {pendientes.map((item) => (
              <li key={item.id}>
                <label className="flex items-center gap-3 border-b border-borde/60 py-2 text-sm text-tinta last:border-0">
                  <input
                    type="checkbox"
                    className="accent-[var(--color-acento)]"
                    checked={elegidos.includes(item.id)}
                    onChange={() => setElegidos(elegidos.includes(item.id) ? elegidos.filter((x) => x !== item.id) : [...elegidos, item.id])}
                  />
                  <span className="flex-1">
                    {item.cantidad} × {item.nombre}
                  </span>
                  <span className="tabular-nums">{pesosDesdeCentavos(importeItem(item))}</span>
                </label>
              </li>
            ))}
          </ul>
        </PanelTab>

        <CampoNumero etiqueta="Propina" valor={propina} alCambiar={setPropina} decimales={2} prefijo="$" placeholder="0" />

        <div>
          <p className="etiqueta-campo">Pagos</p>
          <div className="flex flex-col gap-2">
            {pagos.map((p) => (
              <div key={p.clave} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Selector opciones={opcionesMedio} valor={p.medioId} alElegir={(medioId) => setPagos(pagos.map((x) => (x.clave === p.clave ? { ...x, medioId } : x)))} />
                </div>
                <NumeroInline
                  etiqueta="Monto"
                  valor={pagos.length === 1 && !p.monto ? textoDesdeCentavos(aCobrar) : p.monto}
                  alCambiar={(monto) => setPagos(pagos.map((x) => (x.clave === p.clave ? { ...x, monto } : x)))}
                  decimales={2}
                  className="w-32"
                />
                {pagos.length > 1 ? (
                  <Boton variante="fantasma" tamano="sm" soloIcono aria-label="Quitar pago" onClick={() => setPagos(pagos.filter((x) => x.clave !== p.clave))}>
                    <X size={14} strokeWidth={1.5} />
                  </Boton>
                ) : null}
              </div>
            ))}
          </div>
          <Boton
            variante="fantasma"
            tamano="sm"
            className="mt-2"
            onClick={() => setPagos([...pagos, { clave: crypto.randomUUID(), medioId: null, monto: '' }])}
            disabled={pagos.length >= 10}
          >
            <Plus size={14} strokeWidth={1.5} /> Otro medio
          </Boton>
        </div>

        {enEfectivo > 0 ? (
          <div className="grid grid-cols-2 items-end gap-3">
            <CampoNumero etiqueta="Recibe en efectivo" valor={recibido} alCambiar={setRecibido} decimales={2} prefijo="$" placeholder="0" />
            <p className="pb-2 text-sm text-tinta-suave">
              Vuelto: <strong className="tabular-nums text-tinta">{recibidoCentavos > enEfectivo ? pesosDesdeCentavos(recibidoCentavos - enEfectivo) : '—'}</strong>
            </p>
          </div>
        ) : null}

        <div className="flex items-baseline justify-between border-t border-borde pt-3">
          <span className="text-sm text-tinta-suave">A cobrar</span>
          <span className="text-xl font-semibold tabular-nums text-tinta">{pesosDesdeCentavos(aCobrar)}</span>
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={cobrando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={cobrar} cargando={cobrando} disabled={consumo <= 0}>
          Cobrar {pesosDesdeCentavos(aCobrar)}
        </Boton>
      </footer>
    </Modal>
  );
}
