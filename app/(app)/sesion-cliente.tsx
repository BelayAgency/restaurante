'use client';

import { createContext, use, useEffect, type ReactNode } from 'react';
import type { Rol } from '@/dominio/roles';
import type { UsuarioSesion } from '@/lib/sesion';

interface Sesion {
  usuario: UsuarioSesion;
  /** El rol con el que se dibuja la interfaz: el propio, salvo soporte mirando otra vista. */
  vista: Rol;
}

const ContextoSesion = createContext<Sesion | null>(null);

export function ProveedorSesion({ usuario, vista, children }: Sesion & { children: ReactNode }) {
  useEffect(() => {
    // La sesión es deslizante en la base, pero la cookie sólo se renueva en
    // una respuesta que la pueda escribir: un render de servidor no puede.
    void fetch('/api/auth/get-session', { cache: 'no-store' }).catch(() => undefined);
  }, []);
  return <ContextoSesion value={{ usuario, vista }}>{children}</ContextoSesion>;
}

export function useSesion(): Sesion {
  const sesion = use(ContextoSesion);
  if (!sesion) throw new Error('useSesion fuera de ProveedorSesion');
  return sesion;
}
