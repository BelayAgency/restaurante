import { rolAlcanza, type Rol } from './roles';

/**
 * El único lugar que dice quién puede qué. Lo usan la UI (para no ofrecer lo
 * que no se puede), el dispositivo al generar un evento sin red y el servidor
 * al aceptarlo: si fueran tres reglas, alguna terminaría discrepando.
 */

export type Accion =
  | 'usuarios.ver'
  | 'usuarios.administrar'
  | 'operador.cambiar'
  | 'salon.operar'
  | 'cocina.operar'
  | 'caja.operar'
  | 'dia.cerrar'
  | 'stock.administrar'
  | 'stock.contar'
  | 'control.configurar'
  | 'reportes.ver'
  | 'carta.administrar'
  | 'plano.administrar'
  | 'control.ver'
  | 'reservas.operar'
  | 'compras.anular';

const PERMISOS: Record<Accion, readonly Rol[]> = {
  'usuarios.ver': ['dueno', 'encargado'],
  'usuarios.administrar': ['dueno'],
  'operador.cambiar': ['dueno', 'encargado', 'cajero', 'mozo', 'cocina', 'stock'],
  'salon.operar': ['dueno', 'encargado', 'cajero', 'mozo'],
  'cocina.operar': ['dueno', 'encargado', 'cocina'],
  'caja.operar': ['dueno', 'encargado', 'cajero'],
  'dia.cerrar': ['dueno', 'encargado'],
  'stock.administrar': ['dueno', 'encargado', 'stock'],
  // Contar bebidas a la noche lo puede hacer quien cierra la barra.
  'stock.contar': ['dueno', 'encargado', 'stock', 'cajero'],
  'control.configurar': ['dueno'],
  'reportes.ver': ['dueno', 'encargado'],
  'carta.administrar': ['dueno', 'encargado'],
  'plano.administrar': ['dueno'],
  'control.ver': ['dueno'],
  'reservas.operar': ['dueno', 'encargado', 'cajero', 'mozo'],
  // Cargar y pagar facturas es de quien hace las compras; anular, de quien controla.
  'compras.anular': ['dueno', 'encargado'],
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
