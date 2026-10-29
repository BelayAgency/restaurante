import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { usuarios } from '@/db/esquema';
import { contrasenaValida } from '@/dominio/contrasena';
import { avisarPorMail } from '@/lib/mails/panel';
import { ErrorDominio } from '@/lib/sesion';
import { auth } from './auth';
import { auditar } from './auditoria';
import { anularCodigos } from './codigos';

export const EMAIL_SOPORTE = 'info@belay.agency';

interface ActorCredencial {
  id: string;
  esSoporte: boolean;
}

/**
 * Todo cambio de contraseña pasa por acá: recuperación, perfil propio y
 * soporte. Cierra todas las sesiones de la cuenta en todos los dispositivos
 * —una contraseña vieja que no sirve para entrar pero cuya sesión sigue viva
 * no es un cambio real— y mata cualquier código pendiente.
 */
export async function cambiarContrasena(usuarioId: string, nueva: string, actor: ActorCredencial | null, ip: string | null) {
  if (!contrasenaValida(nueva)) throw new ErrorDominio('La contraseña no cumple los requisitos');
  const usuario = await db.query.usuarios.findFirst({ where: eq(usuarios.id, usuarioId) });
  if (!usuario) throw new ErrorDominio('La cuenta no existe');

  const contexto = await auth.$context;
  const hash = await contexto.password.hash(nueva);
  const credencial = await contexto.internalAdapter.findCredentialAccount(usuarioId);
  if (credencial) {
    await contexto.internalAdapter.updatePassword(usuarioId, hash);
  } else {
    await contexto.internalAdapter.createAccount({ userId: usuarioId, providerId: 'credential', accountId: usuarioId, password: hash });
  }
  await contexto.internalAdapter.deleteUserSessions(usuarioId);
  await anularCodigos(usuarioId);

  await auditar({
    accion: 'usuario.contrasena_cambiada',
    actor,
    objetivoTipo: 'usuario',
    objetivoId: usuarioId,
    detalle: { propia: actor?.id === usuarioId, porRecuperacion: actor === null },
    ip,
  });
  avisarPorMail('aviso-cambio-contrasena', usuario.email, {});
}

export async function cambiarEmail(usuarioId: string, nuevo: string, actor: ActorCredencial, ip: string | null) {
  const usuario = await db.query.usuarios.findFirst({ where: eq(usuarios.id, usuarioId) });
  if (!usuario) throw new ErrorDominio('La cuenta no existe');
  if (usuario.esSoporte) throw new ErrorDominio('La dirección de soporte no se cambia');
  if (usuario.email === nuevo) throw new ErrorDominio('Es la misma dirección que ya tiene');

  const ocupado = await db.query.usuarios.findFirst({ where: eq(usuarios.email, nuevo) });
  if (ocupado) throw new ErrorDominio('Esa dirección ya la usa otra cuenta');

  await db.update(usuarios).set({ email: nuevo, emailVerificado: false, actualizadoEn: new Date() }).where(eq(usuarios.id, usuarioId));
  await anularCodigos(usuarioId);
  await auditar({
    accion: 'usuario.email_cambiado',
    actor,
    objetivoTipo: 'usuario',
    objetivoId: usuarioId,
    detalle: { anterior: usuario.email, nuevo },
    ip,
  });
  // A la anterior: si alguien se quedó con la sesión y cambió la dirección,
  // el dueño de verdad es el que tiene que enterarse.
  avisarPorMail('aviso-cambio-correo', usuario.email, {});
}

/**
 * A dónde va el código para cambiar una credencial. La regla general es la
 * dirección propia (para el email, la anterior). La excepción es soporte
 * administrando a otro: va a la casilla de la agencia, porque un cliente que
 * perdió su casilla necesita que alguien le devuelva el acceso.
 */
export function destinoDelCodigo(actor: ActorCredencial, objetivo: { id: string; email: string }): string {
  if (actor.esSoporte && actor.id !== objetivo.id) return EMAIL_SOPORTE;
  return objetivo.email;
}
