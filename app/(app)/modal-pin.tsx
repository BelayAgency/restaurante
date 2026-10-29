'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { FORMATO_PIN } from '@/dominio/pin';
import { accionEstablecerPin } from './acciones';

/** El PIN con el que una persona se identifica en un dispositivo compartido del salón. */
export function ModalPin({
  abierto,
  alCerrar,
  usuarioId,
  nombre,
}: {
  abierto: boolean;
  alCerrar: () => void;
  usuarioId: string;
  /** Sólo cuando es el PIN de otra persona. */
  nombre?: string;
}) {
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  function cerrar() {
    setPin('');
    setRepetir('');
    setError(undefined);
    alCerrar();
  }

  function alMandar(e: FormEvent) {
    e.preventDefault();
    if (!FORMATO_PIN.test(pin)) return setError('El PIN tiene que tener de 4 a 6 números');
    if (pin !== repetir) return setError('Los dos PIN no coinciden');
    iniciar(async () => {
      const resultado = await accionEstablecerPin(usuarioId, pin);
      if (!resultado.ok) return setError(resultado.error);
      toast.exito('PIN guardado', 'Los dispositivos lo toman en la próxima sincronización.');
      cerrar();
    });
  }

  return (
    <Modal
      abierto={abierto}
      alCerrar={cerrar}
      titulo={nombre ? `PIN de ${nombre}` : 'Tu PIN de operador'}
      descripcion="Identifica a la persona en las tablets y celulares compartidos del salón. No sirve para entrar al sistema."
    >
      <form onSubmit={alMandar}>
        <div className="modal-cuerpo flex flex-col gap-4">
          <Campo
            etiqueta="PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            disabled={guardando}
            error={error}
            data-foco-inicial
          />
          <Campo
            etiqueta="Repetilo"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={repetir}
            onChange={(e) => setRepetir(e.target.value.replace(/\D/g, ''))}
            disabled={guardando}
          />
        </div>
        <footer className="modal-pie">
          <Boton type="button" variante="secundario" onClick={cerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={guardando}>
            Guardar
          </Boton>
        </footer>
      </form>
    </Modal>
  );
}
