'use client';

import { useState, useTransition } from 'react';
import { RotateCcw } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { EstadoVacio, Tabla, Td, Th } from '@/components/ui';
import type { Catalogo } from '@/dominio/catalogo';
import type { Cobro, Cuenta } from '@/dominio/reductores/salon';
import { centavosDesdeTexto, fechaHora, pesosDesdeCentavos, textoDesdeCentavos } from '@/lib/formato';
import { useRegistrar, type Operador } from '../salon/contexto';

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

/** Las últimas cuentas cerradas: para reabrir una o corregir cómo se pagó. */
export function CuentasCerradas({ cuentas, catalogo, operador, nombreCuenta }: { cuentas: Cuenta[]; catalogo: Catalogo; operador: Operador; nombreCuenta: (c: Cuenta) => string }) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [corrigiendo, setCorrigiendo] = useState<{ cuentaId: string; cobro: Cobro } | null>(null);
  const [ocupado, iniciar] = useTransition();

  if (!cuentas.length) return <EstadoVacio titulo="Todavía no se cerró ninguna cuenta" />;

  return (
    <>
      <Tabla>
        <thead>
          <tr>
            <Th>Cuenta</Th>
            <Th>Cerrada</Th>
            <Th>Cobros</Th>
            <Th>
              <span className="sr-only">Acciones</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {cuentas.map((c) => (
            <tr key={c.id}>
              <Td className="font-medium">{nombreCuenta(c)}</Td>
              <Td className="tabular-nums text-tinta-suave">{c.cerradaEn ? fechaHora(c.cerradaEn) : '—'}</Td>
              <Td>
                <div className="flex flex-col gap-1">
                  {c.cobros.map((cobro) => (
                    <button
                      key={cobro.id}
                      type="button"
                      onClick={() => setCorrigiendo({ cuentaId: c.id, cobro })}
                      className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm text-tinta hover:text-acento"
                    >
                      {pesosDesdeCentavos(cobro.consumoCentavos + cobro.propinaCentavos)} · {cobro.pagos.map((p) => p.nombre).join(' + ')}
                    </button>
                  ))}
                </div>
              </Td>
              <Td className="text-right">
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  disabled={ocupado}
                  onClick={() =>
                    iniciar(async () => {
                      if (await registrar('cuenta_reabierta', c.id, {})) toast.exito('Cuenta reabierta');
                    })
                  }
                >
                  <RotateCcw size={13} strokeWidth={1.5} /> Reabrir
                </Boton>
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      {corrigiendo ? <ModalCorregirCobro cuentaId={corrigiendo.cuentaId} cobro={corrigiendo.cobro} catalogo={catalogo} operador={operador} alCerrar={() => setCorrigiendo(null)} /> : null}
    </>
  );
}
