import { connection } from 'next/server';
import { z } from 'zod';
import { exigirSesion, respuestaDeError } from '@/lib/sesion';
import { leerFotoProducto } from '@/servidor/carta';
import { respuestaFoto } from '@/servidor/fotos';

export async function GET(pedido: Request, { params }: RouteContext<'/api/fotos/[id]'>) {
  await connection();
  try {
    await exigirSesion();
    const id = z.uuid().safeParse((await params).id);
    return respuestaFoto(pedido, id.success ? await leerFotoProducto(id.data) : null);
  } catch (error) {
    return respuestaDeError(error);
  }
}
