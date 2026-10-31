import { cn } from '@/lib/cn';

const SEGMENTOS = 12;

/**
 * Cuánto hay contra el mínimo, en una barra de segmentos. La barra llena es el
 * doble del mínimo: así el mínimo cae a la mitad y se ve de un vistazo cuánto
 * margen queda, sin que un insumo con mucho de más tape la diferencia entre los
 * que están justos.
 */
export function NivelStock({ cantidad, minimo, texto, textoMinimo }: { cantidad: number; minimo: number; texto: string; textoMinimo: string }) {
  const llenos = minimo > 0 ? Math.min(SEGMENTOS, Math.max(0, Math.round((cantidad / (minimo * 2)) * SEGMENTOS))) : 0;
  const tono = cantidad <= 0 ? 'bg-error' : cantidad < minimo ? 'bg-alerta' : 'bg-exito';

  return (
    <div className="w-full sm:min-w-44">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn('text-sm font-semibold tabular-nums', cantidad <= 0 ? 'text-error' : 'text-tinta')}>{texto}</span>
        {minimo > 0 ? <span className="text-xs tabular-nums text-tinta-tenue">Mín: {textoMinimo}</span> : null}
      </div>
      {minimo > 0 ? (
        <div className="mt-1.5 flex gap-0.5" role="meter" aria-valuenow={cantidad} aria-valuemin={0} aria-valuemax={minimo * 2} aria-label={`${texto}, mínimo ${textoMinimo}`}>
          {Array.from({ length: SEGMENTOS }, (_, i) => (
            <span key={i} className={cn('h-2 flex-1 rounded-[2px]', i < llenos ? tono : 'bg-borde')} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
