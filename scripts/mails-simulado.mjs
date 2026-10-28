/*
 * Simulador del panel de mails de Belay, SOLO para desarrollo local.
 *
 * Acepta el POST /mails que hace `lib/mails/panel.ts` y responde 200 sin
 * mandar nada: imprime plantilla, destinatario y variables por consola, que en
 * dev es donde se lee el código de recuperación. En producción no se usa —
 * BELAY_API_URL apunta al panel real.
 *
 *   node scripts/mails-simulado.mjs   →  http://127.0.0.1:9096
 */
import { createServer } from 'node:http';

const PUERTO = 9096;

createServer((pedido, respuesta) => {
  if (pedido.method !== 'POST' || !pedido.url.startsWith('/mails')) {
    respuesta.writeHead(404).end();
    return;
  }

  let cuerpo = '';
  pedido.on('data', (trozo) => (cuerpo += trozo));
  pedido.on('end', () => {
    try {
      const { plantilla, destinatario, variables } = JSON.parse(cuerpo);
      console.log(`[mail] ${plantilla} → ${destinatario}`, variables ?? {});
      respuesta.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    } catch {
      respuesta.writeHead(400).end();
    }
  });
}).listen(PUERTO, '127.0.0.1', () => {
  console.log(`Panel de mails simulado en http://127.0.0.1:${PUERTO}`);
});
