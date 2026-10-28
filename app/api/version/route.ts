import { connection } from 'next/server';

export async function GET() {
  // Sin esto, con Cache Components el handler se prerenderiza y Cloudflare
  // podría seguir sirviendo el id del build anterior.
  await connection();
  return Response.json(
    { id: process.env.NEXT_PUBLIC_ID_BUILD ?? 'dev' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
