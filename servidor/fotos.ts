import 'server-only';
import { ErrorDominio } from '@/lib/sesion';

export type TipoFoto = 'image/jpeg' | 'image/webp';

const MAXIMO_FOTO = 600 * 1024;

/** Lo que dicen los primeros bytes, no lo que declara quien sube: un archivo que no es imagen no entra. */
function tipoReal(imagen: Buffer): TipoFoto | null {
  if (imagen.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (imagen.subarray(0, 4).toString('ascii') === 'RIFF' && imagen.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Con la versión en la dirección, esa foto no cambia nunca: se guarda para siempre.
 * Pedida sin versión (o con una vieja), no se guarda.
 */
export function respuestaFoto(pedido: Request, foto: { imagen: Buffer; tipo: string; version: string } | null): Response {
  if (!foto) return new Response(null, { status: 404 });
  const fija = new URL(pedido.url).searchParams.get('v') === foto.version;
  return new Response(new Uint8Array(foto.imagen), {
    headers: { 'content-type': foto.tipo, 'cache-control': fija ? 'private, max-age=31536000, immutable' : 'private, no-cache' },
  });
}

export type TipoAdjunto = TipoFoto | 'image/png' | 'application/pdf';

// Una foto de factura llega achicada del navegador (unos cientos de KB); el
// techo es por si alguien la manda sin pasar por ahí. Un PDF no se puede
// achicar sin perder el texto: entra tal cual, hasta el tope del sistema viejo.
const MAXIMO_IMAGEN_ADJUNTO = 1536 * 1024;
const MAXIMO_PDF = 6 * 1024 * 1024;

/** Valida la foto o el PDF de una factura o de un comprobante de pago, por sus bytes. */
export function validarAdjunto(contenido: Buffer): TipoAdjunto {
  if (contenido.subarray(0, 5).toString('ascii') === '%PDF-') {
    if (contenido.length > MAXIMO_PDF) throw new ErrorDominio('El PDF pesa más de 6 MB');
    return 'application/pdf';
  }
  const tipo: TipoAdjunto | null = tipoReal(contenido) ?? (contenido.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png' : null);
  if (!tipo) throw new ErrorDominio('El archivo tiene que ser una foto o un PDF');
  if (contenido.length > MAXIMO_IMAGEN_ADJUNTO) throw new ErrorDominio('La foto es demasiado pesada');
  return tipo;
}

/** Valida una foto subida (de un plato o de un insumo) y devuelve su tipo real. */
export function validarFoto(imagen: Buffer): TipoFoto {
  if (imagen.length > MAXIMO_FOTO) throw new ErrorDominio('La foto es demasiado pesada');
  const tipo = tipoReal(imagen);
  if (!tipo) throw new ErrorDominio('El archivo no es una foto JPG o WebP');
  return tipo;
}
