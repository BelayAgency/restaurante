'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PantallaEntrar, type AvisoAcceso } from '@/components/acceso';
import { accionEntrar } from '../acciones';

export function FormularioEntrar() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mantener, setMantener] = useState(true);
  const [aviso, setAviso] = useState<AvisoAcceso>();
  const [enviando, iniciar] = useTransition();

  function alEnviar() {
    iniciar(async () => {
      const resultado = await accionEntrar({ email, contrasena, mantener });
      if (resultado.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      setContrasena('');
      if (resultado.motivo === 'credenciales') {
        setAviso({
          tono: 'error',
          detalle: (
            <>
              El mail o la contraseña no coinciden.
              <br />
              {resultado.intentosRestantes === 1 ? 'Te queda 1 intento.' : `Te quedan ${resultado.intentosRestantes} intentos.`}
            </>
          ),
        });
      } else if (resultado.motivo === 'bloqueada') {
        setAviso({
          tono: 'alerta',
          titulo: 'La cuenta está bloqueada por seguridad',
          detalle: (
            <>
              Probá de nuevo en {resultado.minutos} {resultado.minutos === 1 ? 'minuto' : 'minutos'}, o{' '}
              <a href="/recuperar" className="font-medium text-acento hover:underline">
                restablecé la contraseña
              </a>{' '}
              ahora.
            </>
          ),
        });
      } else {
        setAviso({ tono: 'alerta', detalle: 'Demasiados intentos desde esta conexión. Esperá un minuto.' });
      }
    });
  }

  return (
    <PantallaEntrar
      email={email}
      alCambiarEmail={setEmail}
      password={contrasena}
      alCambiarPassword={setContrasena}
      mantenerSesion={mantener}
      alCambiarMantenerSesion={setMantener}
      alEnviar={alEnviar}
      enviando={enviando}
      aviso={aviso}
      hrefOlvidaste="/recuperar"
    />
  );
}
