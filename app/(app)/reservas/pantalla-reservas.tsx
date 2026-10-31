'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Ban, CalendarDays, ChevronLeft, ChevronRight, MessageSquareText, Pencil, Phone, Plus, UserX, UsersRound } from 'lucide-react';
import { Boton } from '@/components/boton';
import { MenuAcciones } from '@/components/menu-acciones';
import { useToast } from '@/components/toast';
import { EstadoVacio, Insignia, Tarjeta, TituloSeccion, type TonoInsignia } from '@/components/ui';
import { correrDia, diaLocal, horaLocal, NOMBRE_ESTADO_RESERVA, type EstadoReserva } from '@/dominio/reservas';
import { cn } from '@/lib/cn';
import { fechaCorta } from '@/lib/formato';
import type { ReservaDelDia } from '@/servidor/reservas';
import { accionCerrarReserva } from './acciones';
import { ModalReserva, ModalSentar } from './modales';

const TONO_ESTADO: Record<EstadoReserva, TonoInsignia> = {
  pendiente: 'acento',
  sentada: 'exito',
  no_vino: 'error',
  cancelada: 'neutro',
};

const DIA_SEMANA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' });

function nombreDia(dia: string, hoy: string): string {
  if (dia === hoy) return 'Hoy';
  if (dia === correrDia(hoy, 1)) return 'Mañana';
  if (dia === correrDia(hoy, -1)) return 'Ayer';
  const semana = DIA_SEMANA.format(new Date(`${dia}T12:00:00Z`));
  return `${semana[0]!.toUpperCase()}${semana.slice(1)}`;
}

function NavegadorDia({ dia, hoy }: { dia: string; hoy: string }) {
  const flecha = 'grid h-8 w-8 place-items-center rounded-lg text-tinta-suave hover:bg-fill-fantasma-hover hover:text-tinta';
  return (
    <div className="flex items-center gap-1">
      <Link href={`/reservas?dia=${correrDia(dia, -1)}`} aria-label="Día anterior" className={flecha}>
        <ChevronLeft size={16} strokeWidth={1.5} />
      </Link>
      <span className="min-w-36 text-center text-sm">
        <span className="font-medium text-tinta">{nombreDia(dia, hoy)}</span> <span className="tabular-nums text-tinta-tenue">{fechaCorta(dia)}</span>
      </span>
      <Link href={`/reservas?dia=${correrDia(dia, 1)}`} aria-label="Día siguiente" className={flecha}>
        <ChevronRight size={16} strokeWidth={1.5} />
      </Link>
      {dia !== hoy ? (
        <Link href="/reservas" className="ml-1 rounded-lg px-2 py-1 text-sm text-acento hover:bg-fill-fantasma-hover">
          Hoy
        </Link>
      ) : null}
    </div>
  );
}

/** Una reserva del día: hora, a nombre de quién, cuántos, y lo que se puede hacer con ella. */
export function FilaReserva({ reserva, alSentar, alEditar }: { reserva: ReservaDelDia; alSentar: () => void; alEditar?: () => void }) {
  const toast = useToast();
  const [ocupado, iniciar] = useTransition();
  const pendiente = reserva.estado === 'pendiente';

  function cerrar(estado: 'no_vino' | 'cancelada') {
    iniciar(async () => {
      const resultado = await accionCerrarReserva(reserva.id, estado);
      if (!resultado.ok) toast.error(resultado.error);
      else toast.exito(estado === 'no_vino' ? 'Marcada: no vino' : 'Reserva cancelada');
    });
  }

  return (
    <li className={cn('flex items-center gap-4 border-b border-borde/60 py-3 last:border-0', !pendiente && 'opacity-60')}>
      <span className="w-12 shrink-0 text-base font-semibold tabular-nums text-tinta">{horaLocal(new Date(reserva.reservadaPara))}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-tinta">
          {reserva.nombreCliente}
          <span className="inline-flex items-center gap-1 font-normal text-tinta-suave">
            <UsersRound size={13} strokeWidth={1.5} /> {reserva.personas}
          </span>
          {!pendiente ? <Insignia tono={TONO_ESTADO[reserva.estado]}>{NOMBRE_ESTADO_RESERVA[reserva.estado]}</Insignia> : null}
        </p>
        {reserva.telefono || reserva.nota ? (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-tinta-tenue">
            {reserva.telefono ? (
              <a href={`tel:${reserva.telefono.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 hover:text-tinta">
                <Phone size={11} strokeWidth={1.5} /> {reserva.telefono}
              </a>
            ) : null}
            {reserva.nota ? (
              <span className="inline-flex items-center gap-1">
                <MessageSquareText size={11} strokeWidth={1.5} /> {reserva.nota}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      {pendiente ? (
        <div className="flex shrink-0 items-center gap-1">
          <Boton variante="secundario" tamano="sm" onClick={alSentar} disabled={ocupado}>
            Llegó
          </Boton>
          <MenuAcciones
            acciones={[
              ...(alEditar ? [{ texto: 'Editar', icono: <Pencil size={15} strokeWidth={1.5} />, alElegir: alEditar, deshabilitada: ocupado }] : []),
              { texto: 'No vino', icono: <UserX size={15} strokeWidth={1.5} />, alElegir: () => cerrar('no_vino'), deshabilitada: ocupado },
              { texto: 'Cancelar reserva', icono: <Ban size={15} strokeWidth={1.5} />, alElegir: () => cerrar('cancelada'), deshabilitada: ocupado },
            ]}
          />
        </div>
      ) : null}
    </li>
  );
}

export function PantallaReservas({ dia, reservas }: { dia: string; reservas: ReservaDelDia[] }) {
  const hoy = diaLocal();
  // `undefined`: cerrado; `null`: una nueva.
  const [editando, setEditando] = useState<ReservaDelDia | null>();
  const [sentando, setSentando] = useState<ReservaDelDia | null>(null);
  const pendientes = reservas.filter((r) => r.estado === 'pendiente');
  const personas = pendientes.reduce((s, r) => s + r.personas, 0);

  return (
    <>
      <TituloSeccion
        descripcion={pendientes.length ? `${pendientes.length} ${pendientes.length === 1 ? 'reserva pendiente' : 'reservas pendientes'}, ${personas} ${personas === 1 ? 'persona' : 'personas'}.` : undefined}
        accion={
          <Boton variante="primario" onClick={() => setEditando(null)}>
            <Plus size={15} strokeWidth={1.75} /> Nueva reserva
          </Boton>
        }
      >
        Reservas
      </TituloSeccion>

      <Tarjeta>
        <div className="mb-2 flex justify-center sm:justify-start">
          <NavegadorDia dia={dia} hoy={hoy} />
        </div>
        {reservas.length === 0 ? (
          <EstadoVacio icono={<CalendarDays size={28} strokeWidth={1.5} />} titulo="No hay reservas para este día" />
        ) : (
          <ul>
            {reservas.map((r) => (
              <FilaReserva key={r.id} reserva={r} alSentar={() => setSentando(r)} alEditar={() => setEditando(r)} />
            ))}
          </ul>
        )}
      </Tarjeta>

      {editando !== undefined ? <ModalReserva key={editando?.id ?? 'nueva'} reserva={editando} diaInicial={dia} alCerrar={() => setEditando(undefined)} /> : null}
      {sentando ? <ModalSentar reserva={sentando} alCerrar={() => setSentando(null)} /> : null}
    </>
  );
}
