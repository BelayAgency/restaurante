import { connection } from 'next/server';
import { z } from 'zod';
import { esquemaEvento, MAX_EVENTOS_POR_ENVIO } from '@/dominio/eventos';
import { exigirSesion, respuestaDeError } from '@/lib/sesion';
import { eventosDesde, recibirEventos } from '@/servidor/sync';

const envio = z.object({
  dispositivoId: z.uuid(),
  horaDispositivo: z.iso.datetime({ offset: true }).nullable(),
  eventos: z.array(z.unknown()).max(MAX_EVENTOS_POR_ENVIO),
});

export async function POST(pedido: Request) {
  try {
    const actor = await exigirSesion();
    const cuerpo = envio.safeParse(await pedido.json().catch(() => null));
    if (!cuerpo.success) return Response.json({ error: 'Envío inválido' }, { status: 422 });

    // Uno que no valida no se puede guardar (le faltan los campos del sobre):
    // vuelve como inválido para que el dispositivo lo aparte en vez de
    // reintentarlo para siempre.
    const validos = [];
    const invalidos: string[] = [];
    for (const crudo of cuerpo.data.eventos) {
      const evento = esquemaEvento.safeParse(crudo);
      if (evento.success) validos.push(evento.data);
      else invalidos.push(String((crudo as { id?: unknown } | null)?.id ?? ''));
    }

    const recepciones = await recibirEventos(actor, cuerpo.data.dispositivoId, validos, cuerpo.data.horaDispositivo);
    return Response.json({ recepciones, invalidos, horaServidor: new Date().toISOString() });
  } catch (error) {
    return respuestaDeError(error);
  }
}

export async function GET(pedido: Request) {
  // Sin esto el build intenta prerenderizarla y choca con la sesión.
  await connection();
  try {
    await exigirSesion();
    const parametros = new URL(pedido.url).searchParams;
    const dispositivoId = z.uuid().safeParse(parametros.get('dispositivo'));
    const desde = z.coerce.number().int().min(0).safeParse(parametros.get('desde') ?? '0');
    if (!dispositivoId.success || !desde.success) return Response.json({ error: 'Pedido inválido' }, { status: 422 });
    return Response.json(await eventosDesde(dispositivoId.data, desde.data), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return respuestaDeError(error);
  }
}
