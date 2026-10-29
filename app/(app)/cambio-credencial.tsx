'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ModalCambiarCredencial } from '@/components/modal-usuario';
import { useToast } from '@/components/toast';
import { evaluarPassword } from '@/dominio/contrasena';
import { accionConfirmarCambio, accionIniciarCambio, accionVerificarCambio } from './acciones';

type Paso = 'pidiendo' | 'codigo' | 'valor-nuevo';

/**
 * El circuito de código para cambiar email o contraseña, propio o —sólo
 * soporte— de otro. Se monta con `abierto` y pide el código una sola vez por
 * apertura; el componente visual no dispara nada por su cuenta.
 */
export function CambioCredencial({
  abierto,
  alCerrar,
  objetivoId,
  tipo,
}: {
  abierto: boolean;
  alCerrar: () => void;
  objetivoId: string;
  tipo: 'email' | 'contrasena';
}) {
  const toast = useToast();
  const [paso, setPaso] = useState<Paso>('pidiendo');
  const [solicitud, setSolicitud] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [valor, setValor] = useState('');
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();
  const pedido = useRef(false);

  function cerrar() {
    pedido.current = false;
    setPaso('pidiendo');
    setSolicitud(null);
    setCodigo('');
    setValor('');
    setError(undefined);
    alCerrar();
  }

  function pedirCodigo() {
    setPaso('pidiendo');
    setCodigo('');
    setError(undefined);
    iniciar(async () => {
      const resultado = await accionIniciarCambio(objetivoId, tipo);
      if (!resultado.ok) {
        toast.error(resultado.error);
        cerrar();
        return;
      }
      setSolicitud(resultado.datos);
      setPaso('codigo');
    });
  }

  useEffect(() => {
    if (!abierto || pedido.current) return;
    pedido.current = true;
    pedirCodigo();
    // pedirCodigo sólo cambia cuando cambia el objetivo, y eso reabre el modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Al completar la sexta casilla el valor llega como argumento: el estado
  // todavía no se actualizó en ese mismo evento.
  function confirmar(completo?: string) {
    if (!solicitud) return;
    if (paso === 'codigo') {
      const valorCodigo = typeof completo === 'string' ? completo : codigo;
      iniciar(async () => {
        const resultado = await accionVerificarCambio(solicitud, valorCodigo);
        if (!resultado.ok) {
          setError(resultado.error);
          setCodigo('');
          return;
        }
        setCodigo(valorCodigo);
        setError(undefined);
        setPaso('valor-nuevo');
      });
      return;
    }
    iniciar(async () => {
      const resultado = await accionConfirmarCambio(solicitud, codigo, valor);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.exito(tipo === 'email' ? 'Email cambiado' : 'Contraseña cambiada', tipo === 'contrasena' ? 'Se cerraron las demás sesiones.' : undefined);
      cerrar();
    });
  }

  return (
    <ModalCambiarCredencial
      abierto={abierto}
      alCerrar={cerrar}
      tipo={tipo}
      enviado={solicitud !== null}
      paso={paso}
      valor={paso === 'codigo' ? codigo : valor}
      alCambiarValor={paso === 'codigo' ? setCodigo : setValor}
      requisitos={tipo === 'contrasena' && paso === 'valor-nuevo' ? evaluarPassword(valor) : undefined}
      alReenviar={pedirCodigo}
      alConfirmar={confirmar}
      guardando={guardando}
      error={error}
    />
  );
}
