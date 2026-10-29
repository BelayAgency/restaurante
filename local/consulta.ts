import { useEffect, useState, type DependencyList } from 'react';
import { liveQuery } from 'dexie';

/**
 * Una consulta a la base del dispositivo que se vuelve a correr sola cuando
 * cambian las tablas que lee. `undefined` mientras carga.
 */
export function useConsultaLocal<T>(consulta: () => Promise<T>, dependencias: DependencyList): T | undefined {
  const [valor, setValor] = useState<T>();

  useEffect(() => {
    const suscripcion = liveQuery(consulta).subscribe({
      next: setValor,
      error: (error: unknown) => console.error('[base local]', error),
    });
    return () => suscripcion.unsubscribe();
    // Las dependencias las declara quien llama, como en useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  return valor;
}
