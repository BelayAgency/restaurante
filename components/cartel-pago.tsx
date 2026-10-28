/*
 * Cartel de pago pendiente y bloqueo del sistema (prompt-base sección 6).
 *
 * Lee `servicio` tal cual lo devuelve `GET {BELAY_API_URL}/facturacion`
 * (sección 13.2), a través de `leerServicioBelay()` de
 * `design-system/lib/servicio-belay.ts`, y no decide nada por su cuenta:
 * `bloquear` dice si se corta el sistema, `motivoBloqueo` con qué texto, y
 * `estado` si hay que mostrar la franja de aviso. La cuenta de días que se ve
 * en la franja es sólo para el texto — sale de `graciaHasta`, que ya viene
 * resuelto del panel — y nunca decide si se bloquea.
 *
 * `bloquear` se mira PRIMERO, antes que `estado`. Un bloqueo desde el panel le
 * llega también a un cliente que está al día: si esto devolviera `null` con
 * `al_dia` antes de mirar `bloquear`, ese bloqueo no se vería nunca.
 *
 * Tres formas, completamente distintas a propósito:
 *
 * - **Franja** (cobro con problema, `bloquear: false`): angosta, arriba de
 *   todo, igual que `CartelNuevaVersion` — se ve, pero no interrumpe. El
 *   sistema sigue operando durante los siete días de gracia.
 * - **Bloqueo por pago** (`motivoBloqueo: 'pago'`): pantalla completa, sin
 *   ninguna acción para cerrarla.
 * - **Bloqueo desde el panel** (`motivoBloqueo: 'panel'`): igual, con un texto
 *   fijo que no habla de pagos — no tiene por qué ser por plata, y el motivo
 *   que se escribió en el panel no viaja hasta acá.
 *
 * La pantalla es lo que ve el usuario; que el bloqueo se cumpla lo hace el
 * servidor, rechazando con 423 (sección 6). Va arriba de todo en el layout
 * autenticado, por fuera del `marco`, junto a `CartelNuevaVersion`. Si el
 * panel no contesta, `servicio` es `null` y esto no se monta: sin dato se
 * asume al día.
 */

import { Lock, TriangleAlert } from 'lucide-react';

export interface ServicioFacturacion {
  estado: 'al_dia' | 'pendiente' | 'con_problema' | 'sin_cobros';
  /** Fecha ISO. Sólo para nombrarla en el texto — nunca para calcular nada. */
  graciaHasta: string | null;
  bloquear: boolean;
  /**
   * Sólo para el texto. Opcional porque un panel viejo no lo manda: sin él, un
   * bloqueo se lee como de pago, que era el único que existía.
   */
  motivoBloqueo?: 'pago' | 'panel' | null;
}

function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(
    new Date(`${iso}T12:00:00.000Z`),
  );
}

/** `10/10/26`. Sólo para mostrar — la cuenta de días usa la misma fecha. */
function formatearFechaCorta(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(
    new Date(`${iso}T12:00:00.000Z`),
  );
}

/** Días que faltan hasta `iso` (mediodía UTC de los dos lados, para no
 * perder un día por la zona horaria). Nunca negativo: si ya pasó, 0. */
function diasHasta(iso: string): number {
  const hoy = new Date();
  const limite = new Date(`${iso}T12:00:00.000Z`);
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), 12);
  const dias = Math.round((limite.getTime() - hoyUtc) / 86_400_000);
  return Math.max(dias, 0);
}

export function CartelPago({ servicio }: { servicio: ServicioFacturacion | null }) {
  if (!servicio) return null;

  // Primero el bloqueo, esté como esté el pago. Ver el comentario de arriba.
  if (servicio.bloquear) {
    return servicio.motivoBloqueo === 'panel' ? (
      <Bloqueo
        titulo="Sistema suspendido"
        texto="El acceso a este sistema está suspendido. Para más información, comunicate con el administrador del sistema."
      />
    ) : (
      <Bloqueo
        titulo="Sistema suspendido por falta de pago"
        texto={`El pago de este mes no se acreditó${
          servicio.graciaHasta ? ` desde el ${formatearFecha(servicio.graciaHasta)}` : ''
        }. El acceso queda pausado hasta que se resuelva.`}
      />
    );
  }

  if (servicio.estado === 'al_dia' || servicio.estado === 'sin_cobros') return null;

  const dias = servicio.graciaHasta ? diasHasta(servicio.graciaHasta) : null;

  return (
    <div className="flex items-center justify-center gap-2 bg-alerta px-4 py-1.5 text-center text-[13px] font-medium text-white">
      <TriangleAlert size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
      <span>
        No pudimos acreditar el pago de este mes.{' '}
        {dias !== null
          ? `Queda${dias === 1 ? '' : 'n'} ${dias} día${dias === 1 ? '' : 's'} antes del bloqueo (${formatearFechaCorta(servicio.graciaHasta!)}).`
          : 'Si no se resuelve pronto, el sistema deja de estar disponible.'}
      </span>
    </div>
  );
}

/* Sin botón de cerrar ni de "volver": no hay nada del otro lado a lo que
   volver. Tampoco un enlace de pago adentro del sistema — Belay no cobra desde
   acá (sección 6). */
function Bloqueo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="bloqueo-titulo"
      aria-describedby="bloqueo-texto"
      className="fixed inset-0 z-50 flex items-center justify-center bg-lienzo/95 p-6 backdrop-blur-sm"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-error-tenue text-error">
          <Lock size={24} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div>
          <h1 id="bloqueo-titulo" className="text-lg font-semibold text-tinta">
            {titulo}
          </h1>
          <p id="bloqueo-texto" className="mt-2 text-sm text-tinta-suave">
            {texto}
          </p>
        </div>
      </div>
    </div>
  );
}
