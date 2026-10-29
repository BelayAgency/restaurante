'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  PantallaCodigo,
  PantallaNuevaContrasena,
  PantallaPedirCodigo,
  type AvisoAcceso,
} from '@/components/acceso';
import { evaluarPassword } from '@/dominio/contrasena';
import { accionPedirCodigo, accionRestablecer, accionVerificarCodigo } from '../acciones';

// Espejo de servidor/codigos.ts y servidor/acceso.ts: sólo para el texto de
// la pantalla, no deciden nada.
const MINUTOS_CODIGO = 15;
const SEGUNDOS_REENVIO = 60;

type Paso = 'pedir' | 'codigo' | 'nueva';

const SIN_ENVIO: AvisoAcceso = { tono: 'error', detalle: 'No pudimos enviar el mail, probá en unos minutos.' };
const LIMITE: AvisoAcceso = { tono: 'alerta', detalle: 'Pediste demasiados códigos. Esperá unos minutos y probá de nuevo.' };

export function FlujoRecuperar() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>('pedir');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [repetir, setRepetir] = useState('');
  const [codigoVencido, setCodigoVencido] = useState(false);
  const [aviso, setAviso] = useState<AvisoAcceso>();
  const [segundos, setSegundos] = useState(0);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (segundos <= 0) return;
    const reloj = setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => clearTimeout(reloj);
  }, [segundos]);

  function pedir() {
    iniciar(async () => {
      const resultado = await accionPedirCodigo(email);
      if (!resultado.ok) {
        setAviso(resultado.motivo === 'limite' ? LIMITE : SIN_ENVIO);
        return;
      }
      setAviso(undefined);
      setCodigo('');
      setCodigoVencido(false);
      setSegundos(SEGUNDOS_REENVIO);
      setPaso('codigo');
    });
  }

  function verificar(valor: string) {
    iniciar(async () => {
      const resultado = await accionVerificarCodigo({ email, codigo: valor });
      if (resultado.ok) {
        setAviso(undefined);
        setPaso('nueva');
        return;
      }
      setCodigo('');
      if (resultado.motivo === 'codigo') {
        setAviso({
          tono: 'error',
          detalle: (
            <>
              El código no es correcto o ya venció.
              <br />
              {resultado.intentosRestantes === 1 ? 'Te queda 1 intento.' : `Te quedan ${resultado.intentosRestantes} intentos.`}
            </>
          ),
        });
      } else if (resultado.motivo === 'limite') {
        setAviso(LIMITE);
      } else {
        setAviso({ tono: 'error', detalle: 'El código ya no es válido. Pedí uno nuevo con «Reenviar código».' });
        setSegundos(0);
      }
    });
  }

  function guardar() {
    if (contrasena !== repetir) {
      setAviso({ tono: 'error', detalle: 'Las dos contraseñas no coinciden.' });
      return;
    }
    iniciar(async () => {
      const resultado = await accionRestablecer({ email, codigo, contrasena });
      if (resultado.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      if (resultado.motivo === 'vencido') setCodigoVencido(true);
      else setAviso({ tono: 'error', detalle: 'La contraseña no cumple los requisitos.' });
    });
  }

  if (paso === 'pedir') {
    return (
      <PantallaPedirCodigo
        email={email}
        alCambiarEmail={setEmail}
        alEnviar={pedir}
        enviando={enviando}
        aviso={aviso}
        hrefVolver="/entrar"
      />
    );
  }

  if (paso === 'codigo') {
    return (
      <PantallaCodigo
        emailIngresado={email}
        valor={codigo}
        alCambiar={setCodigo}
        alCompletar={verificar}
        minutos={MINUTOS_CODIGO}
        segundosParaReenviar={segundos}
        alReenviar={pedir}
        deshabilitado={enviando}
        aviso={aviso}
      />
    );
  }

  return (
    <PantallaNuevaContrasena
      emailUsuario={email}
      password={contrasena}
      alCambiarPassword={setContrasena}
      repetir={repetir}
      alCambiarRepetir={setRepetir}
      requisitos={evaluarPassword(contrasena)}
      alGuardar={guardar}
      enviando={enviando}
      aviso={aviso}
      codigoVencido={codigoVencido}
      alPedirNuevoCodigo={() => {
        setCodigoVencido(false);
        pedir();
      }}
    />
  );
}
