'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { EstadoVacio } from '@/components/ui';
import { diaLocal } from '@/dominio/reservas';
import type { ReservaDelDia } from '@/servidor/reservas';
import { ModalReserva, ModalSentar } from '../reservas/modales';
import { FilaReserva } from '../reservas/pantalla-reservas';

/** Las reservas que faltan llegar hoy, a mano desde el salón para sentarlas. */
export function ModalReservasHoy({ reservas, alCerrar, alSentar }: { reservas: ReservaDelDia[]; alCerrar: () => void; alSentar: (cuentaId: string) => void }) {
  const [sentando, setSentando] = useState<ReservaDelDia | null>(null);
  const [cargando, setCargando] = useState(false);
  return (
    <>
      <Modal abierto={!sentando} alCerrar={alCerrar} titulo="Reservas de hoy">
        <div className="modal-cuerpo">
          {reservas.length === 0 ? (
            <EstadoVacio icono={<CalendarDays size={28} strokeWidth={1.5} />} titulo="No falta llegar nadie" />
          ) : (
            <ul>
              {reservas.map((r) => (
                <FilaReserva key={r.id} reserva={r} alSentar={() => setSentando(r)} />
              ))}
            </ul>
          )}
        </div>
        <footer className="modal-pie">
          <Link href="/reservas" className="mr-auto text-sm font-medium text-acento hover:underline">
            Ver todas las reservas
          </Link>
          <Boton variante="primario" onClick={() => setCargando(true)}>
            <Plus size={15} strokeWidth={1.75} /> Nueva reserva
          </Boton>
        </footer>
      </Modal>
      {/* Se apila encima: al cargarla, la lista de abajo ya la muestra si es para hoy. */}
      {cargando ? <ModalReserva reserva={null} diaInicial={diaLocal()} irAlDia={false} alCerrar={() => setCargando(false)} /> : null}
      {sentando ? (
        <ModalSentar
          reserva={sentando}
          alCerrar={() => setSentando(null)}
          alSentar={(cuentaId) => {
            alCerrar();
            alSentar(cuentaId);
          }}
        />
      ) : null}
    </>
  );
}
