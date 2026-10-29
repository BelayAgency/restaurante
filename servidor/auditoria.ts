import 'server-only';
import { db } from '@/db/cliente';
import { auditoria } from '@/db/esquema';

export type AccionAuditada =
  | 'usuario.creado'
  | 'usuario.editado'
  | 'usuario.rol_cambiado'
  | 'usuario.desactivado'
  | 'usuario.reactivado'
  | 'usuario.eliminado'
  | 'usuario.sesiones_cerradas'
  | 'usuario.contrasena_cambiada'
  | 'usuario.email_cambiado'
  | 'usuario.codigo_enviado'
  | 'usuario.pin_cambiado'
  | 'dispositivo.registrado'
  | 'dispositivo.revocado'
  | 'carta.modificada'
  | 'plano.modificado'
  | 'stock.modificado';

export async function auditar(registro: {
  accion: AccionAuditada;
  actor: { id: string; esSoporte: boolean } | null;
  objetivoTipo: 'usuario' | 'dispositivo' | 'carta' | 'plano' | 'stock';
  objetivoId: string;
  detalle?: Record<string, unknown>;
  ip?: string | null;
}) {
  await db.insert(auditoria).values({
    accion: registro.accion,
    actorId: registro.actor?.id ?? null,
    actorEsSoporte: registro.actor?.esSoporte ?? false,
    objetivoTipo: registro.objetivoTipo,
    objetivoId: registro.objetivoId,
    detalle: registro.detalle ?? {},
    ip: registro.ip ?? null,
  });
}
