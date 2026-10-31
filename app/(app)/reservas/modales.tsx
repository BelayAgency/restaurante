'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { CampoNumero } from '@/components/campo-numero';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { cuentasAbiertas } from '@/dominio/reductores/salon';
import { datosReserva, diaLocal, horaLocal } from '@/dominio/reservas';
import { useDatosLocales, useEstadoSalon, useOperadorDe } from '@/local/salon';
import type { ReservaDelDia } from '@/servidor/reservas';
import { useRegistrar, type Operador } from '../salon/contexto';
import { useSesion } from '../sesion-cliente';
import { accionGuardarReserva, accionSentarReserva } from './acciones';

/** Alta y edición. Sólo se edita una pendiente: una reserva resuelta queda como fue. */
export function ModalReserva({
  reserva,
  diaInicial,
  alCerrar,
  irAlDia = true,
}: {
  reserva: ReservaDelDia | null;
  diaInicial: string;
  alCerrar: () => void;
  /** En falso (desde el salón) no se navega al día de la reserva: se sigue donde se estaba. */
  irAlDia?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const para = reserva ? new Date(reserva.reservadaPara) : null;
  const [nombreCliente, setNombreCliente] = useState(reserva?.nombreCliente ?? '');
  const [telefono, setTelefono] = useState(reserva?.telefono ?? '');
  const [personas, setPersonas] = useState(reserva ? String(reserva.personas) : '2');
  const [fecha, setFecha] = useState(para ? diaLocal(para) : diaInicial);
  const [hora, setHora] = useState(para ? horaLocal(para) : '21:00');
  const [nota, setNota] = useState(reserva?.nota ?? '');
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  function alMandar(e: FormEvent) {
    e.preventDefault();
    const datos = datosReserva.safeParse({ id: reserva?.id ?? null, nombreCliente, telefono, personas: Number(personas || 0), fecha, hora, nota });
    if (!datos.success) return setError(datos.error.issues[0]?.message);
    iniciar(async () => {
      const resultado = await accionGuardarReserva(datos.data);
      if (!resultado.ok) return setError(resultado.error);
      toast.exito(reserva ? 'Reserva guardada' : 'Reserva cargada');
      alCerrar();
      // Si se cargó para otro día, se va a ese día para verla.
      if (irAlDia && !reserva && fecha !== diaInicial) router.push(`/reservas?dia=${fecha}`);
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo={reserva ? reserva.nombreCliente : 'Nueva reserva'}>
      <form onSubmit={alMandar}>
        <div className="modal-cuerpo flex flex-col gap-4">
          <Campo etiqueta="A nombre de" value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} maxLength={60} required data-foco-inicial />
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Día" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            <Campo etiqueta="Hora" type="time" step={900} value={hora} onChange={(e) => setHora(e.target.value)} required />
            <CampoNumero etiqueta="Personas" valor={personas} alCambiar={setPersonas} decimales={0} />
          </div>
          <Campo etiqueta="Teléfono (opcional)" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={30} />
          <Campo etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} />
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <footer className="modal-pie">
          <Boton type="button" variante="secundario" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={guardando}>
            {reserva ? 'Guardar' : 'Cargar reserva'}
          </Boton>
        </footer>
      </form>
    </Modal>
  );
}

/**
 * Llegaron: se elige una mesa libre y se abre la cuenta con el evento de
 * siempre (con los comensales de la reserva), y recién ahí la reserva queda
 * sentada y atada a esa cuenta.
 */
export function ModalSentar({ reserva, alCerrar, alSentar }: { reserva: ReservaDelDia; alCerrar: () => void; alSentar?: (cuentaId: string) => void }) {
  const { usuario } = useSesion();
  const toast = useToast();
  const datos = useDatosLocales();
  const estado = useEstadoSalon(datos);
  const operadorId = useOperadorDe(datos, usuario.id);
  const catalogo = datos?.catalogo;
  const operador: Operador = catalogo?.operadores.find((o) => o.id === operadorId) ?? { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
  const registrar = useRegistrar(operador);
  const [mesaId, setMesaId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  const ocupadas = new Set(estado ? cuentasAbiertas(estado).map((c) => c.mesaId) : []);
  const sectores = new Map(catalogo?.sectores.map((s) => [s.id, s.nombre]));
  const libres = (catalogo?.elementos ?? [])
    .filter((e) => e.tipo === 'mesa' && !ocupadas.has(e.id))
    .sort((a, b) => (a.numeroMesa ?? 0) - (b.numeroMesa ?? 0))
    .map((e) => ({
      valor: e.id,
      etiqueta: `Mesa ${e.numeroMesa}`,
      // Las que alcanzan para el grupo, marcadas: no se impide elegir otra, se avisa.
      detalle: `${sectores.get(e.sectorId) ?? ''} · ${e.capacidad ?? 0} lugares${(e.capacidad ?? 0) < reserva.personas ? ' · chica' : ''}`,
    }));

  function sentar() {
    if (!mesaId) return setError('Elegí la mesa');
    const cuentaId = crypto.randomUUID();
    iniciar(async () => {
      const ok = await registrar('cuenta_abierta', cuentaId, { tipo: 'mesa', mesaId, mozoId: operador.id, comensales: reserva.personas, nombre: reserva.nombreCliente });
      if (!ok) return;
      const resultado = await accionSentarReserva(reserva.id, cuentaId);
      // La cuenta ya está abierta: si falla atar la reserva, se avisa pero no se deshace la mesa.
      if (!resultado.ok) toast.alerta('Mesa abierta', `La reserva no se pudo marcar: ${resultado.error}`);
      else toast.exito('Mesa abierta', `${reserva.nombreCliente}, ${reserva.personas} ${reserva.personas === 1 ? 'persona' : 'personas'}`);
      alSentar?.(cuentaId);
      alCerrar();
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo={`Sentar a ${reserva.nombreCliente}`} descripcion={`${reserva.personas} ${reserva.personas === 1 ? 'persona' : 'personas'} · ${horaLocal(new Date(reserva.reservadaPara))}`}>
      <div className="modal-cuerpo flex flex-col gap-3">
        <div>
          <label className="etiqueta-campo">Mesa</label>
          <Selector opciones={libres} valor={mesaId} alElegir={setMesaId} buscador placeholder="Elegí una mesa libre" vacio="No hay mesas libres" deshabilitado={!catalogo} />
        </div>
        <p className="text-sm text-tinta-tenue">Se abre la cuenta a nombre de {operador.nombre}, con los comensales de la reserva.</p>
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton type="button" variante="secundario" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton type="button" variante="primario" onClick={sentar} cargando={guardando} disabled={!mesaId}>
          Sentar
        </Boton>
      </footer>
    </Modal>
  );
}
