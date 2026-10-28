import { connection } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db/cliente';

// Un proceso vivo pero sin base tiene que marcar unhealthy: el deploy vuelve
// atrás si esto no responde 200.
export async function GET() {
  await connection();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ estado: 'ok' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ estado: 'sin base' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
