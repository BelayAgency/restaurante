export const ROLES = ['dueno', 'encargado', 'cajero', 'mozo', 'cocina', 'stock'] as const;
export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  dueno: 'Dueño',
  encargado: 'Encargado',
  cajero: 'Cajero',
  mozo: 'Mozo',
  cocina: 'Cocina',
  stock: 'Compras y stock',
};

// Sólo el orden importa: quien está más arriba puede administrar a quien está
// igual o más abajo, nunca al revés. Los roles operativos comparten escalón.
const ESCALON: Record<Rol, number> = {
  dueno: 3,
  encargado: 2,
  cajero: 1,
  mozo: 1,
  cocina: 1,
  stock: 1,
};

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

export function rolAlcanza(rolPropio: Rol, rolAjeno: Rol): boolean {
  return ESCALON[rolPropio] >= ESCALON[rolAjeno];
}
