import { connection } from 'next/server';
import { z } from 'zod';
import { exigirSesion, respuestaDeError } from '@/lib/sesion';
import { catalogo } from '@/servidor/sync';

export async function GET(pedido: Request) {
  // Sin esto el build intenta prerenderizarla y choca con la sesión.
  await connection();
  try {
    await exigirSesion();
    const dispositivoId = z.uuid().safeParse(new URL(pedido.url).searchParams.get('dispositivo'));
    if (!dispositivoId.success) return Response.json({ error: 'Pedido inválido' }, { status: 422 });
    return Response.json(await catalogo(dispositivoId.data), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return respuestaDeError(error);
  }
}
