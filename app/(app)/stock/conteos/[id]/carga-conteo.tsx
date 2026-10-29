'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { NumeroInline } from '@/components/numero-inline';
import { useToast } from '@/components/toast';
import { Aviso, Insignia, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import { formatearCantidad, NOMBRE_UNIDAD, type UnidadBase } from '@/dominio/stock';
import { fechaHora, numeroDesdeTexto, pesosDesdeCentavos, textoDesdeNumero } from '@/lib/formato';
import { accionCargarConteo, accionCerrarConteo } from '../../acciones';

interface Conteo {
  id: string;
  deposito: string;
  abiertoEn: string;
  cerradoEn: string | null;
  lineas: { insumoId: string; nombre: string; unidad: UnidadBase; contado: number | null; teorico: number | null; diferenciaCentavos: number | null }[];
}

/**
 * La carga es ciega: mientras el conteo está abierto la pantalla no tiene el
 * stock teórico, ni siquiera escondido. Recién al cerrar se muestra la
 * diferencia.
 */
export function CargaConteo({ conteo }: { conteo: Conteo }) {
  const toast = useToast();
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(conteo.lineas.map((l) => [l.insumoId, l.contado === null ? '' : textoDesdeNumero(l.contado)])),
  );
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const cerrado = conteo.cerradoEn !== null;
  const faltan = conteo.lineas.filter((l) => !valores[l.insumoId]).length;

  const aGuardar = () => conteo.lineas.map((l) => ({ insumoId: l.insumoId, contado: valores[l.insumoId] ? numeroDesdeTexto(valores[l.insumoId]!) : null }));

  function guardar() {
    iniciar(async () => {
      const resultado = await accionCargarConteo(conteo.id, aGuardar());
      if (resultado.ok) toast.exito('Conteo guardado', 'Podés seguir después.');
      else toast.error(resultado.error);
    });
  }

  function cerrar() {
    iniciar(async () => {
      const guardado = await accionCargarConteo(conteo.id, aGuardar());
      if (!guardado.ok) return toast.error(guardado.error);
      const resultado = await accionCerrarConteo(conteo.id);
      setConfirmando(false);
      if (!resultado.ok) return toast.error(resultado.error);
      toast.exito('Conteo cerrado', 'El stock quedó ajustado a lo contado.');
      router.refresh();
    });
  }

  const totalDiferencia = conteo.lineas.reduce((s, l) => s + (l.diferenciaCentavos ?? 0), 0);

  return (
    <>
      <TituloSeccion
        descripcion={`${conteo.deposito} · abierto ${fechaHora(conteo.abiertoEn)}${cerrado ? ` · cerrado ${fechaHora(conteo.cerradoEn!)}` : ''}`}
        accion={
          cerrado ? null : (
            <div className="flex gap-2">
              <Boton variante="secundario" onClick={guardar} cargando={ocupado}>
                Guardar
              </Boton>
              <Boton variante="primario" onClick={() => setConfirmando(true)} disabled={ocupado || faltan > 0}>
                Cerrar conteo
              </Boton>
            </div>
          )
        }
      >
        Conteo
      </TituloSeccion>

      {cerrado ? (
        <div className="mb-4">
          <Aviso tono={Math.abs(totalDiferencia) < 1 ? 'exito' : 'alerta'} titulo="Diferencia total">
            {pesosDesdeCentavos(Math.round(totalDiferencia))} a costo promedio.
          </Aviso>
        </div>
      ) : faltan > 0 ? (
        <p className="mb-3 text-sm text-tinta-tenue">Faltan {faltan} por contar.</p>
      ) : null}

      <Tarjeta>
        <Tabla>
          <thead>
            <tr>
              <Th>Insumo</Th>
              <Th className="text-right">Contado</Th>
              {cerrado ? (
                <>
                  <Th className="text-right">Teórico</Th>
                  <Th className="text-right">Diferencia</Th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {conteo.lineas.map((l) => (
              <tr key={l.insumoId}>
                <Td className="font-medium">{l.nombre}</Td>
                <Td className="text-right">
                  {cerrado ? (
                    <span className="tabular-nums">{l.contado === null ? '—' : formatearCantidad(l.contado, l.unidad)}</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <NumeroInline
                        etiqueta={`${l.nombre} contado`}
                        valor={valores[l.insumoId] ?? ''}
                        alCambiar={(v) => setValores({ ...valores, [l.insumoId]: v })}
                        decimales={3}
                        className="w-28"
                      />
                      <span className="w-6 text-xs text-tinta-tenue">{NOMBRE_UNIDAD[l.unidad]}</span>
                    </div>
                  )}
                </Td>
                {cerrado ? (
                  <>
                    <Td className="text-right tabular-nums text-tinta-suave">{l.teorico === null ? '—' : formatearCantidad(l.teorico, l.unidad)}</Td>
                    <Td className="text-right tabular-nums">
                      {l.diferenciaCentavos === null || Math.abs(l.diferenciaCentavos) < 1 ? (
                        '—'
                      ) : (
                        <Insignia tono={l.diferenciaCentavos < 0 ? 'error' : 'alerta'}>{pesosDesdeCentavos(Math.round(l.diferenciaCentavos))}</Insignia>
                      )}
                    </Td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>

      <Modal abierto={confirmando} alCerrar={() => setConfirmando(false)} titulo="Cerrar el conteo">
        <div className="modal-cuerpo">
          <p className="text-sm text-tinta-suave">El stock se ajusta a lo contado y la diferencia queda registrada. Después no se puede cambiar.</p>
        </div>
        <div className="modal-pie">
          <Boton variante="secundario" onClick={() => setConfirmando(false)} disabled={ocupado}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={cerrar} cargando={ocupado}>
            Cerrar conteo
          </Boton>
        </div>
      </Modal>
    </>
  );
}
