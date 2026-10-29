import { connection } from 'next/server';
import { z } from 'zod';
import { exigirSesion, respuestaDeError } from '@/lib/sesion';
import { pedirComprobante } from '@/servidor/facturacion';

export async function GET(_pedido: Request, { params }: RouteContext<'/api/facturacion/[id]/comprobante'>) {
  // Sin esto el build intenta prerenderizarla y choca con la sesión.
  await connection();
  try {
    await exigirSesion('control.ver');
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return Response.json({ error: 'No existe' }, { status: 404 });
    return await pedirComprobante(id.data);
  } catch (error) {
    return respuestaDeError(error);
  }
}
