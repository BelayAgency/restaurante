'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, LogOut, Settings, UserRound, Users, UsersRound } from 'lucide-react';
import { ModalConfiguracion, type SeccionConfiguracion } from '@/components/configuracion';
import { MenuUsuario } from '@/components/menu-usuario';
import { Selector } from '@/components/selector';
import { SelectorTema } from '@/components/tema';
import { useToast } from '@/components/toast';
import { puede } from '@/dominio/permisos';
import { NOMBRE_ROL, ROLES } from '@/dominio/roles';
import { accionCambiarVista } from './acciones';
import { ModalCambiarOperador } from './cambiar-operador';
import { SeccionFacturacion } from './configuracion/seccion-facturacion';
import { SeccionGeneral } from './configuracion/seccion-general';
import { SeccionUsuarios } from './configuracion/seccion-usuarios';
import { useSesion } from './sesion-cliente';

const OPCIONES_VISTA = ROLES.map((r) => ({ valor: r, etiqueta: `Vista: ${NOMBRE_ROL[r]}` }));

function SelectorVista() {
  const { vista } = useSesion();
  const toast = useToast();
  const [, iniciar] = useTransition();
  return (
    <Selector
      opciones={OPCIONES_VISTA}
      valor={vista}
      alElegir={(elegida) =>
        iniciar(async () => {
          const resultado = await accionCambiarVista(elegida);
          if (!resultado.ok) toast.error(resultado.error);
        })
      }
    />
  );
}

async function salir(router: ReturnType<typeof useRouter>) {
  await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined);
  // Las pantallas guardadas para trabajar sin red son de la sesión que se va.
  // La base local no se toca: puede tener eventos sin enviar.
  if ('caches' in window) await Promise.all((await caches.keys()).map((c) => caches.delete(c))).catch(() => undefined);
  router.replace('/entrar');
  router.refresh();
}

export function PieUsuario() {
  const router = useRouter();
  const { usuario } = useSesion();
  const [configuracion, setConfiguracion] = useState(false);
  const [cambiandoOperador, setCambiandoOperador] = useState(false);

  const secciones: SeccionConfiguracion[] = [
    { id: 'general', titulo: 'General', icono: <UserRound size={17} strokeWidth={1.5} />, contenido: <SeccionGeneral /> },
  ];
  if (puede(usuario, 'usuarios.ver')) {
    secciones.push({ id: 'usuarios', titulo: 'Usuarios', icono: <Users size={17} strokeWidth={1.5} />, contenido: <SeccionUsuarios /> });
  }
  // La relación con Belay es del dueño, no de cada mozo.
  if (puede(usuario, 'control.ver')) {
    secciones.push({ id: 'facturacion', titulo: 'Facturación', icono: <CreditCard size={17} strokeWidth={1.5} />, contenido: <SeccionFacturacion /> });
  }

  return (
    <div className="flex flex-col gap-2">
      <SelectorTema />
      {usuario.esSoporte ? <SelectorVista /> : null}
      <MenuUsuario
        nombre={usuario.nombre}
        email={usuario.email}
        foto={usuario.foto}
        acciones={[
          { texto: 'Configuración', icono: <Settings size={16} strokeWidth={1.5} />, alElegir: () => setConfiguracion(true) },
          { texto: 'Cambiar de operador', icono: <UsersRound size={16} strokeWidth={1.5} />, alElegir: () => setCambiandoOperador(true) },
          { texto: 'Cerrar sesión', icono: <LogOut size={16} strokeWidth={1.5} />, alElegir: () => void salir(router) },
        ]}
      />
      <ModalConfiguracion abierto={configuracion} alCerrar={() => setConfiguracion(false)} secciones={secciones} />
      {cambiandoOperador ? <ModalCambiarOperador abierto alCerrar={() => setCambiandoOperador(false)} /> : null}
    </div>
  );
}
