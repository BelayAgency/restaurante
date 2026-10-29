import 'server-only';

/**
 * Límite de pedidos por clave en una ventana. En memoria del proceso: el
 * sistema corre en un solo container, y un reinicio que lo pone en cero es
 * aceptable para frenar fuerza bruta (el bloqueo por intentos fallidos sí
 * vive en la base).
 */

const ventanas = new Map<string, number[]>();

export function dentroDelLimite(clave: string, maximo: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  const recientes = (ventanas.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (recientes.length >= maximo) {
    ventanas.set(clave, recientes);
    return false;
  }
  recientes.push(ahora);
  ventanas.set(clave, recientes);
  if (ventanas.size > 10_000) {
    for (const [k, marcas] of ventanas) if (marcas.every((t) => ahora - t >= ventanaMs)) ventanas.delete(k);
  }
  return true;
}
