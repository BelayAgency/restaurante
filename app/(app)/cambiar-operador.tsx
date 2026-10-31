'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { verificarPin } from '@/dominio/pin';
import { pinBloqueado, reducirDispositivo } from '@/dominio/reductores/dispositivo';
import { NOMBRE_ROL } from '@/dominio/roles';
import { useDatosLocales, useOperadorDe } from '@/local/salon';
import { registrarEvento } from '@/local/sync';
import { useSesion } from './sesion-cliente';

/**
 * En un dispositivo compartido del salón, cada persona se identifica con su
 * PIN antes de operar: lo que cargue queda a su nombre, no al de quien inició
 * la sesión. Funciona sin red con los PIN del catálogo.
 */
export function ModalCambiarOperador({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const { usuario } = useSesion();
  const toast = useToast();
  const datos = useDatosLocales();
  const operadorActualId = useOperadorDe(datos, usuario.id);
  const [elegido, setElegido] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();
  const [verificando, iniciar] = useTransition();

  const operadores = datos?.catalogo.operadores ?? [];
  const actual = operadores.find((o) => o.id === operadorActualId);
  const opciones = operadores
    .filter((o) => o.id !== operadorActualId)
    .map((o) => ({ valor: o.id, etiqueta: o.nombre, detalle: o.pinHash ? NOMBRE_ROL[o.rol] : 'Sin PIN' }));

  function cerrar() {
    setElegido(null);
    setPin('');
    setError(undefined);
    alCerrar();
  }

  function alMandar(e: FormEvent) {
    e.preventDefault();
    const destino = operadores.find((o) => o.id === elegido);
    if (!destino || !datos?.dispositivoId) return;
    if (!destino.pinHash) return setError('Esta persona todavía no tiene PIN. Lo carga desde Configuración o se lo pone el dueño.');
    const estado = reducirDispositivo(datos.eventos.filter((ev) => ev.agregadoId === datos.dispositivoId));
    if (pinBloqueado(estado, destino.id, new Date())) return setError('Demasiados PIN incorrectos. Esperá unos minutos.');

    // El intento fallido lo firma quien está operando; el cambio, quien entra.
    const firmante = actual ?? { id: usuario.id, rol: usuario.rol };
    const dispositivoId = datos.dispositivoId;
    iniciar(async () => {
      if (await verificarPin(pin, destino.pinHash!)) {
        await registrarEvento('operador_cambiado', dispositivoId, { operadorAnteriorId: operadorActualId }, destino);
        toast.exito(`Ahora opera ${destino.nombre}`);
        cerrar();
      } else {
        await registrarEvento('pin_fallido', dispositivoId, { usuarioIntentadoId: destino.id }, firmante);
        setPin('');
        setError('El PIN no es correcto');
      }
    });
  }

  return (
    <Modal abierto={abierto} alCerrar={cerrar} titulo="Cambiar de operador" descripcion={`Ahora opera ${actual?.nombre ?? usuario.nombre}.`}>
      <form onSubmit={alMandar}>
        <div className="modal-cuerpo flex flex-col gap-4">
          <div>
            <label className="etiqueta-campo">Quién opera</label>
            <Selector opciones={opciones} valor={elegido} alElegir={setElegido} placeholder="Elegí a la persona" buscador vacio="No hay nadie más con acceso" />
          </div>
          <Campo
            etiqueta="PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            disabled={verificando || !elegido}
            error={error}
          />
        </div>
        <footer className="modal-pie">
          <Boton type="button" variante="secundario" onClick={cerrar} disabled={verificando}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={verificando} disabled={!elegido || pin.length < 4}>
            Entrar
          </Boton>
        </footer>
      </form>
    </Modal>
  );
}
