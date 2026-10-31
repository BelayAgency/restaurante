import { connection } from 'next/server';
import { z } from 'zod';
import { exigirSesion, respuestaDeError } from '@/lib/sesion';
import { respuestaFoto } from '@/servidor/fotos';
import { leerFotoInsumo } from '@/servidor/stock';

export async function GET(pedido: Request, { params }: RouteContext<'/api/fotos/insumos/[id]'>) {
  await connection();
  try {
    await exigirSesion();
    const id = z.uuid().safeParse((await params).id);
    return respuestaFoto(pedido, id.success ? await leerFotoInsumo(id.data) : null);
  } catch (error) {
    return respuestaDeError(error);
  }
}
