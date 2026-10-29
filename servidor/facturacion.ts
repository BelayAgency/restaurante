import 'server-only';

/**
 * Qué le cobró Belay al cliente (prompt base 13.2). Se pregunta cada vez y no
 * se guarda: un pago cambia de estado meses después y una copia local diría
 * que está aprobado algo que se devolvió.
 */

export interface Cobro {
  id: string;
  fecha: string;
  periodo: string;
  montoArsCentavos: number;
  estado: 'aprobado' | 'pendiente' | 'rechazado' | 'devuelto' | 'contracargo' | 'otro';
  pagoMercadoPago: string | null;
  comprobante: boolean;
}

export interface Facturacion {
  servicio: {
    feeUsdCentavos: number;
    montoArsCentavos: number;
    proximoCobro: string | null;
    estado: 'al_dia' | 'pendiente' | 'con_problema' | 'sin_cobros';
  };
  cobros: Cobro[];
  paginacion: { limite: number; offset: number; total: number; hayMas: boolean };
}

export const COBROS_POR_PAGINA = 12;
const TIMEOUT_MS = 5_000;

function credenciales() {
  const url = process.env.BELAY_API_URL;
  const llave = process.env.BELAY_API_KEY;
  return url && llave ? { url, llave } : null;
}

/** `null` si el panel no contesta: la pantalla lo dice, no muestra una lista vacía. */
export async function leerFacturacion(offset: number): Promise<Facturacion | null> {
  const panel = credenciales();
  if (!panel) return null;
  try {
    const respuesta = await fetch(`${panel.url}/facturacion?limite=${COBROS_POR_PAGINA}&offset=${offset}`, {
      headers: { authorization: `Bearer ${panel.llave}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!respuesta.ok) return null;
    const datos = (await respuesta.json()) as Partial<Facturacion>;
    if (!datos.servicio || !Array.isArray(datos.cobros) || !datos.paginacion) return null;
    return datos as Facturacion;
  } catch {
    return null;
  }
}

export async function pedirComprobante(id: string): Promise<Response> {
  const panel = credenciales();
  if (!panel) return Response.json({ error: 'No pudimos traer el comprobante' }, { status: 502 });
  try {
    const respuesta = await fetch(`${panel.url}/facturacion/${encodeURIComponent(id)}/comprobante`, {
      headers: { authorization: `Bearer ${panel.llave}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if (!respuesta.ok || !respuesta.body) {
      return Response.json({ error: 'No pudimos traer el comprobante' }, { status: respuesta.status === 404 ? 404 : 502 });
    }
    return new Response(respuesta.body, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="comprobante-${id.slice(0, 8)}.pdf"`,
        'cache-control': 'no-store',
      },
    });
  } catch {
    return Response.json({ error: 'No pudimos traer el comprobante' }, { status: 502 });
  }
}
