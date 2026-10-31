'use client';

import { useRef, useState, useTransition } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { achicarImagen, base64DeBlob } from '@/lib/imagen';
import { Boton } from './boton';

/** En la lista se ve a pocos cientos de píxeles: más que esto es peso de más. */
const LADO_MAXIMO = 800;

async function achicar(archivo: File): Promise<string> {
  return base64DeBlob(await achicarImagen(archivo, LADO_MAXIMO));
}

export function CampoFoto({
  etiqueta = 'Foto',
  url,
  alSubir,
  alQuitar,
}: {
  etiqueta?: string;
  /** La foto actual, o `null` si no tiene. */
  url: string | null;
  /** Recibe la foto ya achicada, en base64. Devuelve si quedó guardada. */
  alSubir: (base64: string) => Promise<boolean>;
  alQuitar: () => Promise<boolean>;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState(url);
  const [error, setError] = useState<string>();
  const [ocupado, iniciar] = useTransition();

  function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError(undefined);
    iniciar(async () => {
      try {
        const base64 = await achicar(archivo);
        if (await alSubir(base64)) setVista(`data:image/webp;base64,${base64}`);
      } catch {
        setError('No se pudo leer la foto. Probá con un JPG o un PNG.');
      }
    });
  }

  return (
    <div>
      <p className="etiqueta-campo">{etiqueta}</p>
      <div className="flex flex-col items-start gap-1.5">
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={ocupado}
          className={cn(
            'grid size-32 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-borde-fuerte bg-lienzo text-tinta-tenue transition-opacity hover:border-acento',
            ocupado && 'cursor-wait opacity-60',
          )}
          aria-label={vista ? 'Cambiar la foto' : 'Subir una foto'}
          aria-busy={ocupado}
        >
          {vista ? (
            // eslint-disable-next-line @next/next/no-img-element -- una vista previa local (data:), no hay nada que optimizar
            <img src={vista} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={22} strokeWidth={1.5} />
          )}
        </button>
        {/* Subir y cambiar es tocar la foto; acá queda sólo lo que no se puede hacer tocándola. */}
        {vista ? (
          <Boton
            type="button"
            variante="fantasma"
            tamano="sm"
            disabled={ocupado}
            onClick={() =>
              iniciar(async () => {
                if (await alQuitar()) setVista(null);
              })
            }
          >
            <Trash2 size={13} strokeWidth={1.5} /> Quitar
          </Boton>
        ) : null}
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            elegir(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error ? <p className="mt-1.5 text-sm text-error">{error}</p> : null}
    </div>
  );
}
