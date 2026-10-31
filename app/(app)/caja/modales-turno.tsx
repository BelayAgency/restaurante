'use client';

import { useState, useTransition } from 'react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { Tabs } from '@/components/tabs';
import { useToast } from '@/components/toast';
import { Aviso } from '@/components/ui';
import type { MedioPago } from '@/dominio/catalogo';
import { centavosDesdeTexto } from '@/lib/formato';
import { useRegistrar, type Operador } from '../salon/contexto';

/** Abrir el turno con su fondo: desde la caja y desde el salón, que no se opera sin caja abierta. */
export function useAbrirCaja(operador: Operador, alAbrir?: () => void) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [fondo, setFondo] = useState('');
  const [guardando, iniciar] = useTransition();

  function abrir() {
    const fondoCentavos = centavosDesdeTexto(fondo || '0');
    if (fondoCentavos === null) return;
    iniciar(async () => {
      if (await registrar('turno_abierto', crypto.randomUUID(), { fondoCentavos })) {
        toast.exito('Caja abierta');
        alAbrir?.();
      }
    });
  }

  return { fondo, setFondo, abrir, guardando };
}

export function ModalSalida({ turnoId, operador, alCerrar }: { turnoId: string; operador: Operador; alCerrar: () => void }) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [tipo, setTipo] = useState<'retiro' | 'egreso'>('retiro');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  function registrarSalida() {
    const montoCentavos = centavosDesdeTexto(monto || '0') ?? 0;
    if (montoCentavos <= 0) return setError('Poné el monto');
    if (motivo.trim().length < 3) return setError('Escribí el motivo');
    iniciar(async () => {
      if (await registrar('salida_caja', turnoId, { salidaId: crypto.randomUUID(), tipo, montoCentavos, motivo: motivo.trim() })) {
        toast.exito(tipo === 'retiro' ? 'Retiro registrado' : 'Egreso registrado');
        alCerrar();
      }
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Sacar efectivo de la caja">
      <div className="modal-cuerpo flex flex-col gap-4">
        <Tabs
          etiqueta="Tipo de salida"
          valor={tipo}
          alCambiar={(v) => setTipo(v as 'retiro' | 'egreso')}
          opciones={[
            { valor: 'retiro', etiqueta: 'Retiro' },
            { valor: 'egreso', etiqueta: 'Egreso (un pago)' },
          ]}
        />
        <CampoNumero etiqueta="Monto" valor={monto} alCambiar={setMonto} decimales={2} prefijo="$" placeholder="0" />
        <Campo etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={140} required />
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={registrarSalida} cargando={guardando}>
          Registrar
        </Boton>
      </footer>
    </Modal>
  );
}

/**
 * Arqueo ciego: quien cierra declara lo que contó en cada medio sin ver lo
 * esperado. La diferencia la calcula el sistema y la ve quien controla, no
 * quien cuenta.
 */
export function ModalArqueo({
  turnoId,
  medios,
  operador,
  alCerrar,
}: {
  turnoId: string;
  medios: MedioPago[];
  operador: Operador;
  alCerrar: () => void;
}) {
  const registrar = useRegistrar(operador);
  const toast = useToast();
  const [contado, setContado] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, iniciar] = useTransition();

  function cerrar() {
    iniciar(async () => {
      const declarado = medios.map((m) => ({ medioId: m.id, nombre: m.nombre, efectivo: m.efectivo, montoCentavos: centavosDesdeTexto(contado[m.id] || '0') ?? 0 }));
      if (await registrar('turno_cerrado', turnoId, { declarado })) {
        toast.exito('Caja cerrada', 'El arqueo quedó registrado.');
        alCerrar();
      }
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Cerrar caja" descripcion="Contá y escribí lo que hay en cada medio. El efectivo incluye el fondo inicial.">
      <div className="modal-cuerpo flex flex-col gap-3">
        {medios.map((m) => (
          <CampoNumero
            key={m.id}
            etiqueta={m.nombre}
            valor={contado[m.id] ?? ''}
            alCambiar={(valor) => setContado({ ...contado, [m.id]: valor })}
            decimales={2}
            prefijo="$"
            placeholder="0"
          />
        ))}
        {confirmando ? <Aviso tono="alerta">Una vez cerrada no se puede corregir lo declarado.</Aviso> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        {confirmando ? (
          <Boton variante="peligro" onClick={cerrar} cargando={guardando}>
            Confirmar cierre
          </Boton>
        ) : (
          <Boton variante="primario" onClick={() => setConfirmando(true)}>
            Cerrar caja
          </Boton>
        )}
      </footer>
    </Modal>
  );
}
