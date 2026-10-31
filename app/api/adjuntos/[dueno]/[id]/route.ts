import { connection } from 'next/server';
import { z } from 'zod';
import { ErrorDominio, exigirSesion, ipCliente, respuestaDeError } from '@/lib/sesion';
import { guardarAdjunto, leerAdjunto } from '@/servidor/compras';

/**
 * La foto o el PDF de una factura o de un pago. Va por acá y no por una server
 * action: un PDF de 6 MB pasa el límite de cuerpo de las acciones, y así viaja
 * como bytes y no como base64, un tercio más pesado.
 */

const dueno = z.enum(['compra', 'pago_proveedor']);
const TOPE_BYTES = 6 * 1024 * 1024 + 1024;

async function leerParametros(params: Promise<{ dueno: string; id: string }>) {
  const { dueno: tipo, id } = await params;
  return { duenoTipo: dueno.parse(tipo), duenoId: z.uuid().parse(id) };
}

export async function GET(_pedido: Request, { params }: RouteContext<'/api/adjuntos/[dueno]/[id]'>) {
  await connection();
  try {
    const actor = await exigirSesion();
    const { duenoTipo, duenoId } = await leerParametros(params);
    const adjunto = await leerAdjunto(actor, duenoTipo, duenoId);
    if (!adjunto) return new Response(null, { status: 404 });
    // Se reemplaza al subir otro: no se guarda en el navegador.
    return new Response(new Uint8Array(adjunto.contenido), { headers: { 'content-type': adjunto.tipo, 'cache-control': 'private, no-store' } });
  } catch (error) {
    return respuestaDeError(error);
  }
}

export async function POST(pedido: Request, { params }: RouteContext<'/api/adjuntos/[dueno]/[id]'>) {
  await connection();
  try {
    const actor = await exigirSesion('stock.administrar');
    const { duenoTipo, duenoId } = await leerParametros(params);
    if (Number(pedido.headers.get('content-length') ?? 0) > TOPE_BYTES) return Response.json({ error: 'El archivo pesa más de 6 MB' }, { status: 413 });
    const contenido = Buffer.from(await pedido.arrayBuffer());
    if (contenido.length > TOPE_BYTES) return Response.json({ error: 'El archivo pesa más de 6 MB' }, { status: 413 });
    await guardarAdjunto(actor, duenoTipo, duenoId, contenido, await ipCliente());
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: 'Dirección inválida' }, { status: 400 });
    if (error instanceof ErrorDominio) return Response.json({ error: error.message }, { status: 422 });
    return respuestaDeError(error);
  }
}
