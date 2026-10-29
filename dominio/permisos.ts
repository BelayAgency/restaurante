import { rolAlcanza, type Rol } from './roles';

/**
 * El único lugar que dice quién puede qué. Lo usan la UI (para no ofrecer lo
 * que no se puede), el dispositivo al generar un evento sin red y el servidor
 * al aceptarlo: si fueran tres reglas, alguna terminaría discrepando.
 */

export type Accion =
  | 'usuarios.ver'
  | 'usuarios.administrar'
  | 'dispositivos.registrar'
  | 'dispositivos.administrar'
  | 'operador.cambiar'
  | 'control.ver';

const PERMISOS: Record<Accion, readonly Rol[]> = {
  'usuarios.ver': ['dueno', 'encargado'],
  'usuarios.administrar': ['dueno'],
  'dispositivos.registrar': ['dueno', 'encargado'],
  'dispositivos.administrar': ['dueno'],
  'operador.cambiar': ['dueno', 'encargado', 'cajero', 'mozo', 'cocina', 'stock'],
  'control.ver': ['dueno'],
};

export interface Actor {
  id: string;
  rol: Rol;
  esSoporte: boolean;
}

export function puede(actor: Pick<Actor, 'rol'>, accion: Accion): boolean {
  return PERMISOS[accion].includes(actor.rol);
}

export interface CuentaAdministrable {
  id: string;
  rol: Rol;
  esSoporte: boolean;
}

/**
 * Si `actor` puede administrar la cuenta `objetivo` (rol, estado, sesiones,
 * credenciales). Soporte nunca es objetivo de nadie —ni de sí mismo— y nadie
 * administra a alguien de un escalón superior.
 */
export function puedeAdministrarCuenta(actor: Actor, objetivo: CuentaAdministrable): boolean {
  if (objetivo.esSoporte) return false;
  if (actor.id === objetivo.id) return false;
  if (!puede(actor, 'usuarios.administrar')) return false;
  return actor.esSoporte || rolAlcanza(actor.rol, objetivo.rol);
}
