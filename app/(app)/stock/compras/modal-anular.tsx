'use client';

import { useState, useTransition } from 'react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { motivoAnulacion } from '@/dominio/compras';

/** Anular no borra nada, pero cambia la cuenta: por eso pide el motivo, que queda registrado. */
export function ModalAnular({ titulo, aviso, alAnular, alCerrar }: { titulo: string; aviso: string; alAnular: (motivo: string) => Promise<string | null>; alCerrar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string>();
  const [anulando, iniciar] = useTransition();

  function anular() {
    const valido = motivoAnulacion.safeParse(motivo);
    if (!valido.success) return setError(valido.error.issues[0]?.message);
    iniciar(async () => {
      const fallo = await alAnular(valido.data);
      if (fallo) setError(fallo);
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo={titulo} descripcion={aviso}>
      <div className="modal-cuerpo">
        <Campo etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} required data-foco-inicial />
        {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={anulando}>
          Cancelar
        </Boton>
        <Boton variante="peligro" onClick={anular} cargando={anulando}>
          Anular
        </Boton>
      </footer>
    </Modal>
  );
}
