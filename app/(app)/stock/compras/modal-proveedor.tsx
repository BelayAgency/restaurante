'use client';

import { useState, useTransition } from 'react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { accionGuardarProveedor } from '../acciones';

export function ModalProveedor({ alCerrar }: { alCerrar: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [cuit, setCuit] = useState('');
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  function guardar() {
    iniciar(async () => {
      const resultado = await accionGuardarProveedor({ id: null, nombre, cuit: cuit.trim() || null });
      if (!resultado.ok) return setError(resultado.error);
      toast.exito('Proveedor cargado');
      alCerrar();
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Nuevo proveedor">
      <div className="modal-cuerpo flex flex-col gap-4">
        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required data-foco-inicial />
        <Campo etiqueta="CUIT (opcional)" value={cuit} onChange={(e) => setCuit(e.target.value)} inputMode="numeric" />
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={guardar} cargando={guardando}>
          Guardar
        </Boton>
      </footer>
    </Modal>
  );
}
