'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Selector, type OpcionSelector } from './selector';

/* Selector atado a un parámetro de la URL: el filtrado real lo hace el
   servidor al re-renderizar la página con el nuevo query string. */
export function FiltroSelector({
  parametro,
  opciones,
  valorTodos = 'todos',
  buscador,
  className,
}: {
  parametro: string;
  /* La primera opción suele ser el "todos", con valor `valorTodos`. */
  opciones: OpcionSelector[];
  valorTodos?: string;
  buscador?: boolean;
  className?: string;
}) {
  const enrutador = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  function aplicar(valor: string): void {
    const nuevos = new URLSearchParams(parametros);
    if (valor === valorTodos) nuevos.delete(parametro);
    else nuevos.set(parametro, valor);
    // Cambiar un filtro siempre vuelve a la primera página.
    nuevos.delete('pagina');
    enrutador.replace(`${ruta}?${nuevos.toString()}`);
  }

  return (
    <div className={className ?? 'w-48'}>
      <Selector
        opciones={opciones}
        valor={parametros.get(parametro) ?? valorTodos}
        alElegir={aplicar}
        buscador={buscador}
      />
    </div>
  );
}
