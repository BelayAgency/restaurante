'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Avisos efímeros, garantizados por encima de los modales.
 *
 * Los modales del panel son `<dialog>` con `showModal()`, que los pone en el
 * *top layer* del navegador — una capa donde `z-index` no llega. Un aviso
 * normal quedaría tapado justo cuando más se necesita, porque casi todos nacen
 * de una acción disparada dentro de un modal.
 *
 * La solución no es obvia y está medida, no supuesta. Se probaron tres cosas:
 *
 *  1. Un `popover` en el body. También va al top layer, pero **pierde** contra
 *     un `<dialog>` modal aunque se muestre después: reabrirlo no lo reordena.
 *  2. Dos diálogos: ahí sí manda el orden de apertura.
 *  3. Un `popover` que es **hijo** del diálogo abierto: queda arriba.
 *
 * Así que la capa se muda: mientras haya un modal abierto vive adentro de él, y
 * cuando no hay, vuelve al body. Un `MutationObserver` sigue el atributo `open`
 * para mudarla en el momento en que un modal se abre o se cierra.
 *
 * De paso resuelve otra cosa: un modal deja `inert` al resto del documento, así
 * que un aviso que viviera afuera no se podría ni cerrar con el mouse.
 */

export type TonoToast = 'exito' | 'error' | 'alerta' | 'info';

export interface Toast {
  id: number;
  tono: TonoToast;
  titulo: string;
  detalle?: string;
  /* Marcado al cerrar: el aviso anima su salida y recién después se desmonta. */
  saliendo?: boolean;
}

type Entrada = Omit<Toast, 'id' | 'tono'>;

interface ApiToasts {
  exito(titulo: string, detalle?: string): void;
  error(titulo: string, detalle?: string): void;
  alerta(titulo: string, detalle?: string): void;
  info(titulo: string, detalle?: string): void;
}

const Contexto = createContext<ApiToasts | null>(null);

export function useToast(): ApiToasts {
  const api = useContext(Contexto);
  if (!api) throw new Error('useToast necesita <ProveedorToasts> más arriba en el árbol');
  return api;
}

/**
 * Cuánto queda en pantalla.
 *
 * Un error dura más porque suele traer algo que leer y decidir; una
 * confirmación se entiende de un vistazo y estorba si se queda.
 */
const DURACION_MS: Record<TonoToast, number> = {
  exito: 4_000,
  info: 5_000,
  alerta: 7_000,
  error: 9_000,
};

/** Más de esto en pantalla ya no se lee: se apila y tapa la propia página. */
const MAXIMO = 3;

/** Cuánto dura la animación de salida antes de desmontar (ver .toast-sale). */
const SALIDA_MS = 200;

export function ProveedorToasts({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const contenedor = useRef<HTMLDivElement>(null);
  const siguienteId = useRef(0);

  // Dos fases: React no puede animar un nodo que ya desmontó, así que primero
  // se marca `saliendo` (dispara la animación) y el filtrado espera a que
  // termine.
  const cerrar = useCallback((id: number) => {
    setToasts((previos) => previos.map((t) => (t.id === id ? { ...t, saliendo: true } : t)));
    setTimeout(() => {
      setToasts((previos) => previos.filter((t) => t.id !== id));
    }, SALIDA_MS);
  }, []);

  const agregar = useCallback(
    (tono: TonoToast, entrada: Entrada) => {
      const id = (siguienteId.current += 1);
      setToasts((previos) => [...previos.slice(-(MAXIMO - 1)), { id, tono, ...entrada }]);

      setTimeout(() => {
        cerrar(id);
      }, DURACION_MS[tono]);
    },
    [cerrar],
  );

  const api = useMemo<ApiToasts>(
    () => ({
      exito: (titulo, detalle) => agregar('exito', { titulo, detalle }),
      error: (titulo, detalle) => agregar('error', { titulo, detalle }),
      alerta: (titulo, detalle) => agregar('alerta', { titulo, detalle }),
      info: (titulo, detalle) => agregar('info', { titulo, detalle }),
    }),
    [agregar],
  );

  /**
   * Dónde se monta la capa: dentro del modal abierto, o en el body.
   *
   * Se recalcula ante cualquier cambio del atributo `open` en el documento,
   * que es lo que hacen `showModal()` y `close()`.
   */
  const [destino, setDestino] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const recalcular = () => {
      setDestino(document.querySelector<HTMLElement>('dialog[open]') ?? document.body);
    };
    recalcular();

    const observador = new MutationObserver(recalcular);
    observador.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    return () => observador.disconnect();
  }, []);

  // Mudarse desmonta y vuelve a montar el nodo, así que el popover se cierra:
  // por eso `destino` también dispara este efecto.
  useEffect(() => {
    const caja = contenedor.current;
    if (!caja || typeof caja.showPopover !== 'function') return;
    // La mudanza entre el modal y el body puede dejar la ref apuntando a un
    // nodo ya desconectado durante un tick; showPopover ahí revienta. El
    // re-render por el cambio de destino vuelve a correr este efecto con el
    // nodo nuevo.
    if (!caja.isConnected) return;

    if (caja.matches(':popover-open')) caja.hidePopover();
    if (toasts.length > 0) caja.showPopover();
  }, [toasts, destino]);

  return (
    <Contexto.Provider value={api}>
      {children}

      {destino
        ? createPortal(
            <div
              ref={contenedor}
              popover="manual"
              className="toast-capa"
              // Los errores interrumpen al lector de pantalla; el resto espera
              // a que termine de leer lo que está leyendo.
              aria-live="polite"
            >
              <div className="flex flex-col items-end gap-2.5">
                {toasts.map((t) => (
                  <Aviso key={t.id} toast={t} alCerrar={() => cerrar(t.id)} />
                ))}
              </div>
            </div>,
            destino,
          )
        : null}
    </Contexto.Provider>
  );
}

// ---------------------------------------------------------------------------

const ICONO = {
  exito: CircleCheck,
  error: CircleAlert,
  alerta: TriangleAlert,
  info: Info,
} as const;

/** Borde, ícono y resplandor comparten el color: es una sola señal, no tres. */
const TONO = {
  exito: { borde: 'border-exito/50', texto: 'text-exito', luz: 'before:bg-exito' },
  error: { borde: 'border-error/50', texto: 'text-error', luz: 'before:bg-error' },
  alerta: { borde: 'border-alerta/50', texto: 'text-alerta', luz: 'before:bg-alerta' },
  info: { borde: 'border-borde-fuerte', texto: 'text-tinta-suave', luz: 'before:bg-tinta-tenue' },
} as const;

function Aviso({ toast, alCerrar }: { toast: Toast; alCerrar: () => void }) {
  const Icono = ICONO[toast.tono];
  const tono = TONO[toast.tono];

  return (
    <div
      role={toast.tono === 'error' ? 'alert' : 'status'}
      className={cn(
        'toast-entra pointer-events-auto relative flex w-full max-w-[400px] gap-3',
        toast.saliendo && 'toast-sale',
        'overflow-hidden rounded-2xl border bg-superficie p-4 shadow-[var(--sombra-tarjeta)]',
        // El resplandor sale del borde izquierdo, por detrás del contenido: da
        // el color sin teñir el texto ni pelearle contraste.
        'before:absolute before:-left-20 before:-top-4 before:h-[200px] before:w-[160px]',
        'before:rounded-full before:opacity-25 before:blur-lg before:content-[""]',
        tono.borde,
        tono.luz,
      )}
    >
      <Icono
        size={18}
        strokeWidth={1.5}
        className={cn('toast-icono relative z-10 mt-px shrink-0', tono.texto)}
      />

      <div className="relative z-10 min-w-0 flex-1">
        <p className="text-sm font-semibold text-tinta">{toast.titulo}</p>
        {toast.detalle ? (
          <p className="mt-1 break-words text-sm leading-5 text-tinta-suave">{toast.detalle}</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={alCerrar}
        aria-label="Cerrar aviso"
        className="relative z-10 -mr-1 -mt-1 shrink-0 self-start rounded-md p-1 text-tinta-tenue transition-colors hover:bg-borde/60 hover:text-tinta"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
