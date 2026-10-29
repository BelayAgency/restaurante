'use client';

import { useState, useTransition } from 'react';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { EstadoVacio, Insignia, Tabla, Tarjeta, Td, Th } from '@/components/ui';
import { fechaHora } from '@/lib/formato';
import { accionRevocarDispositivo } from './acciones';

interface FilaDispositivo {
  id: string;
  nombre: string;
  ultimoContacto: string | null;
  desfaseRelojMs: number | null;
  revocado: boolean;
}

// Más de esto entre el reloj del dispositivo y el del servidor ya mueve una
// venta de un turno a otro.
const DESFASE_TOLERADO_MS = 5 * 60_000;

export function TablaDispositivos({ dispositivos }: { dispositivos: FilaDispositivo[] }) {
  const toast = useToast();
  const [ocupado, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState<FilaDispositivo | null>(null);

  function revocar(id: string) {
    iniciar(async () => {
      const resultado = await accionRevocarDispositivo(id);
      if (resultado.ok) toast.exito('Dispositivo dado de baja');
      else toast.error(resultado.error);
      setConfirmando(null);
    });
  }

  if (dispositivos.length === 0) {
    return (
      <Tarjeta>
        <EstadoVacio titulo="Todavía no hay dispositivos registrados" />
      </Tarjeta>
    );
  }

  return (
    <Tarjeta>
      <Tabla>
        <thead>
          <tr>
            <Th>Nombre</Th>
            <Th>Último contacto</Th>
            <Th>Reloj</Th>
            <Th>
              <span className="sr-only">Acciones</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {dispositivos.map((d) => (
            <tr key={d.id}>
              <Td className="font-medium">{d.nombre}</Td>
              <Td className="tabular-nums">{d.ultimoContacto ? fechaHora(d.ultimoContacto) : 'Nunca'}</Td>
              <Td>
                {d.desfaseRelojMs !== null && Math.abs(d.desfaseRelojMs) > DESFASE_TOLERADO_MS ? (
                  <Insignia tono="alerta">Desfasado {Math.round(d.desfaseRelojMs / 60_000)} min</Insignia>
                ) : (
                  <Insignia tono="neutro">Bien</Insignia>
                )}
              </Td>
              <Td className="text-right">
                {d.revocado ? (
                  <Insignia tono="neutro">Dado de baja</Insignia>
                ) : (
                  <Boton
                    variante="peligro"
                    tamano="sm"
                    disabled={ocupado}
                    onClick={() => setConfirmando(d)}
                  >
                    Dar de baja
                  </Boton>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <Modal abierto={confirmando !== null} alCerrar={() => setConfirmando(null)} titulo="Dar de baja el dispositivo">
        <div className="modal-cuerpo">
          <p className="text-sm text-tinta-suave">
            {confirmando?.nombre} deja de sincronizar. Lo que tenga sin enviar se rechaza; lo que ya mandó queda.
          </p>
        </div>
        <div className="modal-pie">
          <Boton variante="secundario" onClick={() => setConfirmando(null)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" cargando={ocupado} onClick={() => confirmando && revocar(confirmando.id)}>
            Dar de baja
          </Boton>
        </div>
      </Modal>
    </Tarjeta>
  );
}
