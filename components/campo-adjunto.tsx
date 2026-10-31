'use client';

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from 'react';
import { Camera, FileText, Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { achicarImagen } from '@/lib/imagen';
import { Boton } from './boton';

/** En una factura hay que poder leer números chicos: más grande que la foto de un plato. */
const LADO_FACTURA = 2000;
const TOPE_PDF = 6 * 1024 * 1024;

export interface ArchivoAdjunto {
  contenido: Blob;
  nombre: string;
  esPdf: boolean;
}

/**
 * La foto o el PDF de una factura o de un comprobante. La foto se achica acá,
 * antes de subirla: de los 3 a 5 MB de una del celular a unos cientos de KB,
 * todavía legible. Un PDF no se puede achicar sin perder el texto, así que va
 * tal cual, hasta 6 MB. En el celular, «Sacar foto» abre directo la cámara.
 */
export function CampoAdjunto({ etiqueta, alCambiar }: { etiqueta: string; alCambiar: (archivo: ArchivoAdjunto | null) => void }) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [elegido, setElegido] = useState<(ArchivoAdjunto & { vista: string | null }) | null>(null);
  const [error, setError] = useState<string>();
  const [procesando, iniciar] = useTransition();

  useEffect(() => () => void (elegido?.vista && URL.revokeObjectURL(elegido.vista)), [elegido]);

  function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError(undefined);
    iniciar(async () => {
      try {
        let listo: ArchivoAdjunto;
        if (archivo.type === 'application/pdf') {
          if (archivo.size > TOPE_PDF) return setError('El PDF pesa más de 6 MB');
          listo = { contenido: archivo, nombre: archivo.name, esPdf: true };
        } else if (archivo.type.startsWith('image/')) {
          listo = { contenido: await achicarImagen(archivo, LADO_FACTURA, 0.8), nombre: archivo.name, esPdf: false };
        } else {
          return setError('Tiene que ser una foto o un PDF');
        }
        setElegido({ ...listo, vista: listo.esPdf ? null : URL.createObjectURL(listo.contenido) });
        alCambiar(listo);
      } catch {
        setError('No se pudo leer la foto. Probá con un JPG o un PNG.');
      }
    });
  }

  function alElegirArchivo(e: ChangeEvent<HTMLInputElement>) {
    elegir(e.target.files?.[0]);
    // Sin esto, elegir el mismo archivo otra vez no dispara el cambio.
    e.target.value = '';
  }

  function quitar() {
    setElegido(null);
    alCambiar(null);
  }

  return (
    <div>
      <p className="etiqueta-campo">{etiqueta}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => archivoRef.current?.click()}
          disabled={procesando}
          aria-busy={procesando}
          aria-label={elegido ? 'Cambiar el archivo' : 'Elegir un archivo'}
          className={cn(
            'grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-borde-fuerte bg-lienzo text-tinta-tenue transition-opacity hover:border-acento',
            procesando && 'cursor-wait opacity-60',
          )}
        >
          {elegido?.vista ? (
            // eslint-disable-next-line @next/next/no-img-element -- una vista previa local, no hay nada que optimizar
            <img src={elegido.vista} alt="" className="h-full w-full object-cover" />
          ) : elegido ? (
            <FileText size={22} strokeWidth={1.5} />
          ) : (
            <Paperclip size={20} strokeWidth={1.5} />
          )}
        </button>
        <div className="flex min-w-0 flex-col items-start gap-1">
          {elegido ? <p className="max-w-full truncate text-sm text-tinta">{elegido.nombre}</p> : <p className="text-sm text-tinta-tenue">Foto o PDF, hasta 6 MB</p>}
          <div className="flex flex-wrap gap-1">
            <Boton type="button" variante="fantasma" tamano="sm" onClick={() => camaraRef.current?.click()} disabled={procesando}>
              <Camera size={13} strokeWidth={1.5} /> Sacar foto
            </Boton>
            {elegido ? (
              <Boton type="button" variante="fantasma" tamano="sm" onClick={quitar} disabled={procesando}>
                <X size={13} strokeWidth={1.5} /> Quitar
              </Boton>
            ) : null}
          </div>
        </div>
        <input ref={archivoRef} type="file" accept="image/*,application/pdf" hidden onChange={alElegirArchivo} />
        <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={alElegirArchivo} />
      </div>
      {error ? <p className="mt-1.5 text-sm text-error">{error}</p> : null}
    </div>
  );
}

/** Sube el adjunto ya preparado. Devuelve el error en castellano, o `null` si salió bien. */
export async function subirAdjunto(dueno: 'compra' | 'pago_proveedor', id: string, archivo: ArchivoAdjunto): Promise<string | null> {
  try {
    const respuesta = await fetch(`/api/adjuntos/${dueno}/${id}`, { method: 'POST', body: archivo.contenido, headers: { 'content-type': 'application/octet-stream' } });
    if (respuesta.ok) return null;
    const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
    return cuerpo?.error ?? 'No se pudo subir el archivo';
  } catch {
    return 'No se pudo subir el archivo: revisá la conexión';
  }
}
