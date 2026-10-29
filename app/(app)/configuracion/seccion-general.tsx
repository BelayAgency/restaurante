'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/components/boton';
import { FilaConfig, SeccionConfig } from '@/components/configuracion';
import { SelectorTema } from '@/components/tema';
import { useToast } from '@/components/toast';
import { NOMBRE_ROL } from '@/dominio/roles';
import { accionCerrarSesiones, accionEditarNombre } from '../acciones';
import { CambioCredencial } from '../cambio-credencial';
import { ModalPin } from '../modal-pin';
import { useSesion } from '../sesion-cliente';
import { Modal } from '@/components/modal';

export function SeccionGeneral() {
  const router = useRouter();
  const { usuario } = useSesion();
  const toast = useToast();
  const [nombre, setNombre] = useState(usuario.nombre);
  const [cambiando, setCambiando] = useState<'email' | 'contrasena' | null>(null);
  const [pinAbierto, setPinAbierto] = useState(false);
  const [confirmandoSesiones, setConfirmandoSesiones] = useState(false);
  const [guardando, iniciar] = useTransition();

  function guardarNombre() {
    iniciar(async () => {
      const resultado = await accionEditarNombre(nombre);
      if (resultado.ok) toast.exito('Nombre guardado');
      else toast.error(resultado.error);
    });
  }

  function cerrarSesiones() {
    iniciar(async () => {
      const resultado = await accionCerrarSesiones(usuario.id);
      if (!resultado.ok) return toast.error(resultado.error);
      router.replace('/entrar');
      router.refresh();
    });
  }

  return (
    <>
      <SeccionConfig titulo="Perfil">
        <FilaConfig rotulo="Nombre">
          <div className="flex gap-2">
            <input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={guardando} maxLength={60} />
            <Boton variante="secundario" onClick={guardarNombre} disabled={guardando || nombre.trim() === usuario.nombre}>
              Guardar
            </Boton>
          </div>
        </FilaConfig>
        <FilaConfig rotulo="Correo" descripcion={usuario.email}>
          {usuario.esSoporte ? null : (
            <Boton variante="secundario" onClick={() => setCambiando('email')}>
              Cambiar
            </Boton>
          )}
        </FilaConfig>
        <FilaConfig rotulo="Contraseña">
          <Boton variante="secundario" onClick={() => setCambiando('contrasena')}>
            Cambiar
          </Boton>
        </FilaConfig>
        <FilaConfig rotulo="PIN de operador" descripcion="Para identificarte en los dispositivos compartidos.">
          <Boton variante="secundario" onClick={() => setPinAbierto(true)}>
            Cambiar
          </Boton>
        </FilaConfig>
        <FilaConfig rotulo="Rol" descripcion={usuario.esSoporte ? 'Soporte de Belay' : NOMBRE_ROL[usuario.rol]}>
          {null}
        </FilaConfig>
        <FilaConfig rotulo="Sesiones" descripcion="Cierra la sesión en todos los dispositivos, éste incluido.">
          <Boton variante="secundario" onClick={() => setConfirmandoSesiones(true)}>
            Cerrar todas
          </Boton>
        </FilaConfig>
      </SeccionConfig>

      <SeccionConfig titulo="Preferencias">
        <FilaConfig rotulo="Apariencia">
          <SelectorTema />
        </FilaConfig>
      </SeccionConfig>

      {cambiando ? (
        <CambioCredencial abierto alCerrar={() => setCambiando(null)} objetivoId={usuario.id} tipo={cambiando} />
      ) : null}
      <ModalPin abierto={pinAbierto} alCerrar={() => setPinAbierto(false)} usuarioId={usuario.id} />
      <Modal abierto={confirmandoSesiones} alCerrar={() => setConfirmandoSesiones(false)} titulo="Cerrar todas las sesiones">
        <div className="modal-cuerpo">
          <p className="text-sm text-tinta-suave">Vas a tener que volver a iniciar sesión en todos tus dispositivos, éste incluido.</p>
        </div>
        <div className="modal-pie">
          <Boton variante="secundario" onClick={() => setConfirmandoSesiones(false)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" cargando={guardando} onClick={cerrarSesiones}>
            Cerrar sesiones
          </Boton>
        </div>
      </Modal>
    </>
  );
}
