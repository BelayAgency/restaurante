import 'server-only';

/**
 * Los mails salen por el panel de Belay (prompt base 13.1): el sistema no
 * tiene credenciales de ningún proveedor de correo. El catálogo es cerrado,
 * por eso las variables van tipadas por plantilla.
 */

interface VariablesPorPlantilla {
  'recuperacion-contrasena': { codigo: string; minutos: number };
  'aviso-cambio-contrasena': Record<string, never>;
  'cambio-correo': { codigo: string; minutos: number };
  'aviso-cambio-correo': Record<string, never>;
}

export type Plantilla = keyof VariablesPorPlantilla;

const TIMEOUT_MS = 5_000;

export class MailNoEnviado extends Error {}

async function enviarUnaVez<P extends Plantilla>(plantilla: P, destinatario: string, variables: VariablesPorPlantilla[P]) {
  const url = process.env.BELAY_API_URL;
  const llave = process.env.BELAY_API_KEY;
  if (!url || !llave) throw new MailNoEnviado('falta BELAY_API_URL o BELAY_API_KEY');

  const respuesta = await fetch(`${url}/mails`, {
    method: 'POST',
    headers: { authorization: `Bearer ${llave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ plantilla, destinatario, variables }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (respuesta.ok) return;

  const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
  throw new MailNoEnviado(`${respuesta.status} ${cuerpo?.error ?? ''}`.trim());
}

/**
 * Para los mails de los que depende la acción (un código): un reintento corto
 * y, si no sale, tira. Quien llama no consume nada y le dice la verdad al
 * usuario.
 */
export async function enviarMail<P extends Plantilla>(plantilla: P, destinatario: string, variables: VariablesPorPlantilla[P]) {
  try {
    await enviarUnaVez(plantilla, destinatario, variables);
  } catch (primero) {
    if (primero instanceof MailNoEnviado && /^(401|422)/.test(primero.message)) {
      console.error(`[mails] ${plantilla} rechazado por el panel: ${primero.message}`);
      throw primero;
    }
    await new Promise((r) => setTimeout(r, 800));
    try {
      await enviarUnaVez(plantilla, destinatario, variables);
    } catch (segundo) {
      console.error(`[mails] ${plantilla} no salió: ${segundo instanceof Error ? segundo.message : 'error'}`);
      throw segundo instanceof MailNoEnviado ? segundo : new MailNoEnviado('el panel no contesta');
    }
  }
}

/** Para los avisos de algo que ya pasó: no se espera y, si falla, sólo queda en el log. */
export function avisarPorMail<P extends Plantilla>(plantilla: P, destinatario: string, variables: VariablesPorPlantilla[P]) {
  void enviarUnaVez(plantilla, destinatario, variables).catch((error: unknown) => {
    console.error(`[mails] aviso ${plantilla} no salió: ${error instanceof Error ? error.message : 'error'}`);
  });
}
