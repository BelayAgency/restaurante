/**
 * Achica una foto en el navegador antes de subirla: una del celular pesa
 * varios megas. Sale en WebP con el lado largo recortado a `ladoMaximo` (si ya
 * era más chica, queda de su tamaño). Quien llama elige el lado: un plato se ve
 * a pocos cientos de píxeles; en una factura hay que poder leer números chicos.
 */
export async function achicarImagen(archivo: Blob, ladoMaximo: number, calidad = 0.82): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, ladoMaximo / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();
  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/webp', calidad));
  if (!blob) throw new Error('No se pudo leer la foto');
  return blob;
}

export async function base64DeBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}
