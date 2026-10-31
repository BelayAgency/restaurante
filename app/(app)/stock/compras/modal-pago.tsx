'use client';

import { useEffect, useState, useTransition } from 'react';
import { Boton } from '@/components/boton';
import { CampoAdjunto, subirAdjunto, type ArchivoAdjunto } from '@/components/campo-adjunto';
import { Campo } from '@/components/campo';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { datosPago, NOMBRE_FORMA_PAGO } from '@/dominio/compras';
import { diaLocal } from '@/dominio/reservas';
import { centavosDesdeTexto, pesosDesdeCentavos } from '@/lib/formato';
import { accionRegistrarPago, accionResumenDeCuenta } from './acciones';

const FORMAS = Object.entries(NOMBRE_FORMA_PAGO).map(([valor, etiqueta]) => ({ valor, etiqueta }));

/**
 * Un pago al proveedor, sin elegir factura: se reparte solo de la más vieja a
 * la más nueva. Mostrar cuánto se le debe al elegirlo evita pagar de más sin
 * querer (si se paga de más, queda a favor, no se pierde).
 */
export function ModalPago({ proveedores, proveedorInicial, alCerrar }: { proveedores: { id: string; nombre: string }[]; proveedorInicial: string | null; alCerrar: () => void }) {
  const toast = useToast();
  const [proveedorId, setProveedorId] = useState<string | null>(proveedorInicial);
  const [deuda, setDeuda] = useState<{ deuda: number; aFavor: number } | null>(null);
  const [fecha, setFecha] = useState(() => diaLocal());
  const [importe, setImporte] = useState('');
  const [forma, setForma] = useState<string | null>('transferencia');
  const [observacion, setObservacion] = useState('');
  const [comprobante, setComprobante] = useState<ArchivoAdjunto | null>(null);
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();
  const [, iniciarConsulta] = useTransition();

  useEffect(() => {
    if (!proveedorId) return;
    iniciarConsulta(async () => {
      const resultado = await accionResumenDeCuenta(proveedorId);
      setDeuda(resultado.ok ? { deuda: resultado.datos.deudaCentavos, aFavor: resultado.datos.saldoAFavorCentavos } : null);
    });
  }, [proveedorId]);

  const importeCentavos = centavosDesdeTexto(importe || '0') ?? 0;
  const sobra = deuda ? importeCentavos - (deuda.deuda - deuda.aFavor) : 0;

  function guardar() {
    const datos = datosPago.safeParse({ proveedorId, fecha, importeCentavos, forma, observacion: observacion.trim() || null });
    if (!datos.success) return setError(datos.error.issues[0]?.message);
    iniciar(async () => {
      const resultado = await accionRegistrarPago(datos.data);
      if (!resultado.ok) return setError(resultado.error);
      const fallo = comprobante ? await subirAdjunto('pago_proveedor', resultado.datos, comprobante) : null;
      if (fallo) toast.alerta('Pago registrado sin el comprobante', fallo);
      else toast.exito('Pago registrado');
      alCerrar();
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Registrar pago">
      <div className="modal-cuerpo flex flex-col gap-4">
        <div>
          <label className="etiqueta-campo">Proveedor</label>
          <Selector opciones={proveedores.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} valor={proveedorId} alElegir={setProveedorId} buscador />
          {proveedorId && deuda ? (
            <p className="mt-1.5 text-sm tabular-nums text-tinta-suave">
              {deuda.deuda > 0 ? `Se le debe ${pesosDesdeCentavos(deuda.deuda)}` : 'No se le debe nada'}
              {deuda.aFavor > 0 ? ` · ${pesosDesdeCentavos(deuda.aFavor)} a favor` : ''}
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Fecha de pago" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          <div>
            <label className="etiqueta-campo">Forma de pago</label>
            <Selector opciones={FORMAS} valor={forma} alElegir={setForma} />
          </div>
        </div>
        <div>
          <CampoNumero etiqueta="Importe pagado" valor={importe} alCambiar={setImporte} decimales={2} prefijo="$" placeholder="0" />
          {deuda && importeCentavos > 0 && sobra > 0 ? <p className="mt-1.5 text-sm tabular-nums text-alerta">Paga {pesosDesdeCentavos(sobra)} de más: quedan a favor para la próxima factura.</p> : null}
        </div>
        <Campo etiqueta="Observación (opcional)" value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={300} />
        <CampoAdjunto etiqueta="Comprobante (opcional)" alCambiar={setComprobante} />
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={guardar} cargando={guardando}>
          Registrar pago
        </Boton>
      </footer>
    </Modal>
  );
}
