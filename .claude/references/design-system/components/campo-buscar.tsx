import { Search } from 'lucide-react';

/* Búsqueda por GET: el submit recarga la página con ?buscar= y el filtrado lo
   hace el servidor. Los parámetros ocultos conservan los otros filtros. Sin
   etiqueta visible a propósito (el placeholder alcanza en una barra de
   filtros), por eso usa la clase `campo` directo y no el componente Campo. */
export function CampoBuscar({
  accion,
  valor,
  placeholder,
  parametrosOcultos = {},
}: {
  accion: string;
  valor: string;
  placeholder: string;
  parametrosOcultos?: Record<string, string | undefined>;
}) {
  return (
    <form action={accion} className="relative w-full max-w-xs">
      <Search
        size={15}
        strokeWidth={1.5}
        className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-tinta-tenue"
      />
      <input
        name="buscar"
        defaultValue={valor}
        placeholder={placeholder}
        className="campo pl-9"
        aria-label={placeholder}
      />
      {Object.entries(parametrosOcultos).map(([nombre, contenido]) =>
        contenido ? <input key={nombre} type="hidden" name={nombre} value={contenido} /> : null,
      )}
    </form>
  );
}
