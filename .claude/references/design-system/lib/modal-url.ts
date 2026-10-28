'use client';

import { useOptimistic, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Un modal que se abre y se cierra con un parámetro de la URL (`?nuevo=1`,
 * `?venta=<id>`).
 *
 * Cerrarlo es sacar el parámetro, y eso hace que Next pida la página de nuevo
 * al servidor. Si el modal espera esa respuesta para desaparecer, queda en
 * pantalla un rato después del click y parece trabado. Por eso acá el estado es
 * OPTIMISTA: el modal se oculta en el mismo instante del click y la dirección se
 * actualiza por detrás, dentro de la misma transición. Cuando el servidor
 * responde, la página ya coincide con lo que se ve.
 *
 * Todo modal que se abra desde la URL usa este hook para abrir y cerrar, nunca
 * un `router.push`/`replace` suelto.
 *
 *     const venta = useModalUrl('venta');
 *     <Modal abierto={venta.abierto} alCerrar={venta.cerrar} ... />
 *     <button onClick={() => venta.abrir(id)}>Ver</button>
 */
export function useModalUrl(parametro: string) {
  const enrutador = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [, empezarTransicion] = useTransition();

  const [valor, ponerValor] = useOptimistic<string | null, string | null>(
    parametros.get(parametro),
    (_actual, nuevo) => nuevo,
  );

  function navegar(nuevo: string | null) {
    const query = new URLSearchParams(parametros);
    if (nuevo === null) query.delete(parametro);
    else query.set(parametro, nuevo);

    empezarTransicion(() => {
      ponerValor(nuevo);
      const texto = query.toString();
      enrutador.replace(texto ? `${ruta}?${texto}` : ruta, { scroll: false });
    });
  }

  return {
    /** El valor del parámetro (`'1'`, el id…) o `null` si está cerrado. */
    valor,
    abierto: valor !== null,
    abrir: (nuevo = '1') => navegar(nuevo),
    cerrar: () => navegar(null),
  };
}
