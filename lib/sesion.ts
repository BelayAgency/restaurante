import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { auth } from '@/servidor/auth';
import { sistemaBloqueado } from '@/lib/servicio-belay';
import { esRol } from '@/dominio/roles';
import type { Accion, Actor } from '@/dominio/permisos';
import { puede } from '@/dominio/permisos';

export interface UsuarioSesion extends Actor {
  nombre: string;
  email: string;
  foto: string | null;
}

export class ErrorAcceso extends Error {
  constructor(
    readonly estado: 401 | 403 | 423,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export async function ipCliente(): Promise<string | null> {
  const h = await headers();
  // Detrás de Cloudflare la IP real viene en su header; el resto de la cadena
  // la puede escribir cualquiera.
  return h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

/** La sesión del pedido, o `null`. No mira el bloqueo: para eso está `exigirSesion`. */
export async function leerSesion(): Promise<UsuarioSesion | null> {
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (!sesion) return null;
  const u = sesion.user;
  if (!u.activo || !esRol(u.rol)) return null;
  return { id: u.id, nombre: u.name, email: u.email, foto: u.image ?? null, rol: u.rol, esSoporte: u.esSoporte };
}

/**
 * La puerta de toda ruta de API y server action del área autenticada. Corta
 * con 423 si el panel bloqueó el sistema antes de leer o escribir nada: un
 * overlay se saca desde el navegador, esto no.
 */
export async function exigirSesion(accion?: Accion): Promise<UsuarioSesion> {
  if (await sistemaBloqueado()) throw new ErrorAcceso(423, 'Sistema suspendido');
  const usuario = await leerSesion();
  if (!usuario) throw new ErrorAcceso(401, 'Tenés que iniciar sesión');
  if (accion && !puede(usuario, accion)) throw new ErrorAcceso(403, 'No tenés permiso para esto');
  return usuario;
}

/** Demo: además de soporte, el dueño puede alternar entre las vistas de los roles para mostrarlas. */
export function alternaVistas(usuario: Pick<UsuarioSesion, 'esSoporte' | 'rol'>): boolean {
  return usuario.esSoporte || usuario.rol === 'dueno';
}

export function respuestaDeError(error: unknown): Response {
  if (error instanceof ErrorAcceso) return Response.json({ error: error.message }, { status: error.estado });
  console.error('[api]', error);
  return Response.json({ error: 'Algo salió mal' }, { status: 500 });
}

/** Para páginas: sin sesión, al login. */
export async function usuarioDePagina(): Promise<UsuarioSesion> {
  const usuario = await leerSesion();
  if (!usuario) redirect('/entrar');
  return usuario;
}

export type ResultadoAccion<T = undefined> = { ok: true; datos: T } | { ok: false; error: string };

/** Envuelve una server action: los errores esperables vuelven como texto para la pantalla. */
export async function ejecutar<T>(fn: () => Promise<T>): Promise<ResultadoAccion<T>> {
  try {
    return { ok: true, datos: await fn() };
  } catch (error) {
    if (error instanceof ErrorAcceso || error instanceof ErrorDominio) return { ok: false, error: error.message };
    if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? 'Los datos no son válidos' };
    console.error('[accion]', error);
    return { ok: false, error: 'Algo salió mal. Probá de nuevo en un rato.' };
  }
}

/** Un error con un mensaje que se le puede mostrar a la persona tal cual. */
export class ErrorDominio extends Error {}
