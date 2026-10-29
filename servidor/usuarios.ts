import 'server-only';
import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '@/db/cliente';
import { codigosVerificacion, eventos, pinesOperador, usuarios } from '@/db/esquema';
import { contrasenaValida } from '@/dominio/contrasena';
import { hashearPin, FORMATO_PIN } from '@/dominio/pin';
import { email as esquemaEmail } from '@/dominio/texto-mail';
import { puede, puedeAdministrarCuenta } from '@/dominio/permisos';
import type { Rol } from '@/dominio/roles';
import { enviarMail, MailNoEnviado } from '@/lib/mails/panel';
import { ErrorAcceso, ErrorDominio, type UsuarioSesion } from '@/lib/sesion';
import { auth } from './auth';
import { auditar } from './auditoria';
import { crearCodigo, MINUTOS_CODIGO, probarCodigo, codigoVigente, marcarUsado } from './codigos';
import { cambiarContrasena, cambiarEmail, destinoDelCodigo } from './credenciales';

/**
 * Las funciones de dominio sobre cuentas. Soporte pasa por éstas igual que
 * cualquiera —mismos permisos, misma auditoría—: no hay un camino por fuera
 * de la aplicación para tocar usuarios.
 */

export type FilaListado = {
  id: string;
  nombre: string;
  email: string;
  foto: string | null;
  rol: Rol;
  activo: boolean;
  esSoporte: boolean;
  tienePin: boolean;
};

export async function listarUsuarios(actor: UsuarioSesion): Promise<FilaListado[]> {
  if (!puede(actor, 'usuarios.ver')) throw new ErrorAcceso(403, 'No tenés permiso para ver usuarios');
  const filas = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      email: usuarios.email,
      foto: usuarios.foto,
      rol: usuarios.rol,
      activo: usuarios.activo,
      esSoporte: usuarios.esSoporte,
      pin: pinesOperador.usuarioId,
    })
    .from(usuarios)
    .leftJoin(pinesOperador, eq(pinesOperador.usuarioId, usuarios.id))
    .orderBy(asc(usuarios.nombre));
  // Soporte es visible —y marcado— para quien administra usuarios; para el
  // resto no existe.
  const veSoporte = puede(actor, 'usuarios.administrar');
  return filas
    .filter((u) => veSoporte || !u.esSoporte)
    .map(({ pin, ...u }) => ({ ...u, rol: u.rol as Rol, tienePin: pin !== null }));
}

async function cuenta(id: string) {
  const u = await db.query.usuarios.findFirst({ where: eq(usuarios.id, id) });
  if (!u) throw new ErrorDominio('La cuenta no existe');
  return { ...u, rol: u.rol as Rol };
}

async function cuentaAdministrable(actor: UsuarioSesion, id: string) {
  const objetivo = await cuenta(id);
  if (!puedeAdministrarCuenta(actor, objetivo)) throw new ErrorAcceso(403, 'No podés administrar esta cuenta');
  return objetivo;
}

export async function crearUsuario(
  actor: UsuarioSesion,
  datos: { nombre: string; email: string; rol: Rol; contrasena: string },
  ip: string | null,
) {
  if (!puede(actor, 'usuarios.administrar')) throw new ErrorAcceso(403, 'No tenés permiso para crear usuarios');
  if (!puedeAdministrarCuenta(actor, { id: '', rol: datos.rol, esSoporte: false })) {
    throw new ErrorAcceso(403, 'No podés crear una cuenta con un rol superior al tuyo');
  }
  if (!contrasenaValida(datos.contrasena)) throw new ErrorDominio('La contraseña no cumple los requisitos');
  const existente = await db.query.usuarios.findFirst({ where: eq(usuarios.email, datos.email) });
  if (existente) throw new ErrorDominio('Ya hay una cuenta con esa dirección');

  const contexto = await auth.$context;
  const usuario = await contexto.internalAdapter.createUser(
    { name: datos.nombre, email: datos.email, rol: datos.rol, activo: true, esSoporte: false },
    // El alta la hace quien administra el sistema, con la contraseña puesta ahí mismo.
    { method: 'admin' },
  );
  await contexto.internalAdapter.createAccount({
    userId: usuario.id,
    providerId: 'credential',
    accountId: usuario.id,
    password: await contexto.password.hash(datos.contrasena),
  });
  await auditar({ accion: 'usuario.creado', actor, objetivoTipo: 'usuario', objetivoId: usuario.id, detalle: { rol: datos.rol }, ip });
  return usuario.id;
}

export async function editarNombrePropio(actor: UsuarioSesion, nombre: string, ip: string | null) {
  await db.update(usuarios).set({ nombre, actualizadoEn: new Date() }).where(eq(usuarios.id, actor.id));
  await auditar({ accion: 'usuario.editado', actor, objetivoTipo: 'usuario', objetivoId: actor.id, detalle: { nombre }, ip });
}

export async function cambiarRol(actor: UsuarioSesion, id: string, rol: Rol, ip: string | null) {
  const objetivo = await cuentaAdministrable(actor, id);
  if (!puedeAdministrarCuenta(actor, { id, rol, esSoporte: false })) {
    throw new ErrorAcceso(403, 'No podés asignar un rol superior al tuyo');
  }
  if (objetivo.rol === rol) return;
  await db.update(usuarios).set({ rol, actualizadoEn: new Date() }).where(eq(usuarios.id, id));
  await auditar({ accion: 'usuario.rol_cambiado', actor, objetivoTipo: 'usuario', objetivoId: id, detalle: { anterior: objetivo.rol, nuevo: rol }, ip });
}

export async function cambiarEstado(actor: UsuarioSesion, id: string, activo: boolean, ip: string | null) {
  const objetivo = await cuentaAdministrable(actor, id);
  if (objetivo.activo === activo) return;
  await db.update(usuarios).set({ activo, actualizadoEn: new Date() }).where(eq(usuarios.id, id));
  if (!activo) await (await auth.$context).internalAdapter.deleteUserSessions(id);
  await auditar({ accion: activo ? 'usuario.reactivado' : 'usuario.desactivado', actor, objetivoTipo: 'usuario', objetivoId: id, ip });
}

/** Sólo cuentas sin movimientos: con historial, lo que corresponde es desactivar. */
export async function eliminarUsuario(actor: UsuarioSesion, id: string, ip: string | null) {
  await cuentaAdministrable(actor, id);
  const [{ cantidad }] = (await db.select({ cantidad: count() }).from(eventos).where(eq(eventos.operadorId, id))) as [{ cantidad: number }];
  if (cantidad > 0) throw new ErrorDominio('Esta cuenta tiene movimientos: desactivala en lugar de eliminarla');
  await auditar({ accion: 'usuario.eliminado', actor, objetivoTipo: 'usuario', objetivoId: id, ip });
  await (await auth.$context).internalAdapter.deleteUser(id);
}

export async function cerrarSesiones(actor: UsuarioSesion, id: string, ip: string | null) {
  if (id !== actor.id) await cuentaAdministrable(actor, id);
  await (await auth.$context).internalAdapter.deleteUserSessions(id);
  await auditar({ accion: 'usuario.sesiones_cerradas', actor, objetivoTipo: 'usuario', objetivoId: id, ip });
}

/**
 * Quién puede iniciar un cambio de credencial sobre quién. Sobre la propia,
 * cualquiera (soporte también, pero nunca su dirección). Sobre otra, sólo
 * soporte: el código le llega a la agencia. Un admin cliente no puede leer
 * la casilla de otro, así que a él le queda `enviarCodigoRecuperacion`.
 */
async function objetivoDeCredencial(actor: UsuarioSesion, id: string, tipo: 'email' | 'contrasena') {
  if (id === actor.id) {
    if (tipo === 'email' && actor.esSoporte) throw new ErrorDominio('La dirección de soporte no se cambia');
    return cuenta(id);
  }
  if (!actor.esSoporte) throw new ErrorAcceso(403, 'Sólo soporte puede cambiar credenciales de otra cuenta');
  return cuentaAdministrable(actor, id);
}

export async function iniciarCambioCredencial(actor: UsuarioSesion, id: string, tipo: 'email' | 'contrasena', ip: string | null) {
  const objetivo = await objetivoDeCredencial(actor, id, tipo);
  const destinatario = destinoDelCodigo(actor, objetivo);
  const { id: solicitudId, codigo } = await crearCodigo({
    usuarioId: objetivo.id,
    proposito: tipo === 'email' ? 'cambio_email' : 'cambio_contrasena',
    destinatario,
    solicitadoPorId: actor.id,
  });
  try {
    await enviarMail(tipo === 'email' ? 'cambio-correo' : 'recuperacion-contrasena', destinatario, { codigo, minutos: MINUTOS_CODIGO });
  } catch (error) {
    if (error instanceof MailNoEnviado) throw new ErrorDominio('No pudimos enviar el mail, probá en unos minutos');
    throw error;
  }
  await auditar({ accion: 'usuario.codigo_enviado', actor, objetivoTipo: 'usuario', objetivoId: objetivo.id, detalle: { tipo, destinatario }, ip });
  return solicitudId;
}

async function solicitudDe(actor: UsuarioSesion, solicitudId: string) {
  const fila = await db.query.codigosVerificacion.findFirst({
    where: and(eq(codigosVerificacion.id, solicitudId), eq(codigosVerificacion.solicitadoPorId, actor.id)),
  });
  return fila;
}

export async function verificarCambioCredencial(actor: UsuarioSesion, solicitudId: string, codigo: string) {
  const resultado = await probarCodigo(await solicitudDe(actor, solicitudId), codigo);
  if (resultado.ok) return;
  if (resultado.vencido) throw new ErrorDominio('El código venció. Pedí uno nuevo.');
  throw new ErrorDominio(`El código no es correcto o ya venció. Te quedan ${resultado.intentosRestantes} intentos.`);
}

export async function confirmarCambioCredencial(
  actor: UsuarioSesion,
  solicitudId: string,
  codigo: string,
  valor: string,
  ip: string | null,
) {
  const fila = await solicitudDe(actor, solicitudId);
  if (!codigoVigente(fila) || !fila.verificadoEn) throw new ErrorDominio('El código venció. Pedí uno nuevo.');
  if (!(await probarCodigo(fila, codigo)).ok) throw new ErrorDominio('El código venció. Pedí uno nuevo.');

  if (fila.proposito === 'cambio_email') {
    const nuevo = esquemaEmail.safeParse(valor);
    if (!nuevo.success) throw new ErrorDominio('El email no es válido');
    await cambiarEmail(fila.usuarioId, nuevo.data, actor, ip);
  } else {
    await cambiarContrasena(fila.usuarioId, valor, actor, ip);
  }
  await marcarUsado(fila.id);
  return { proposito: fila.proposito, usuarioId: fila.usuarioId };
}

/** Lo que tiene un admin cliente para devolverle el acceso a otro: el mismo código del "¿La olvidaste?". */
export async function enviarCodigoRecuperacion(actor: UsuarioSesion, id: string, ip: string | null) {
  const objetivo = await cuentaAdministrable(actor, id);
  const { codigo } = await crearCodigo({ usuarioId: objetivo.id, proposito: 'recuperacion', destinatario: objetivo.email, solicitadoPorId: actor.id });
  try {
    await enviarMail('recuperacion-contrasena', objetivo.email, { codigo, minutos: MINUTOS_CODIGO });
  } catch (error) {
    if (error instanceof MailNoEnviado) throw new ErrorDominio('No pudimos enviar el mail, probá en unos minutos');
    throw error;
  }
  await auditar({ accion: 'usuario.codigo_enviado', actor, objetivoTipo: 'usuario', objetivoId: id, detalle: { tipo: 'recuperacion' }, ip });
}

/** El PIN lo pone la persona sobre su cuenta, o quien la administra. */
export async function establecerPin(actor: UsuarioSesion, id: string, pin: string, ip: string | null) {
  if (id !== actor.id) await cuentaAdministrable(actor, id);
  if (!FORMATO_PIN.test(pin)) throw new ErrorDominio('El PIN tiene que tener de 4 a 6 números');
  const hash = await hashearPin(pin);
  await db
    .insert(pinesOperador)
    .values({ usuarioId: id, hash })
    .onConflictDoUpdate({ target: pinesOperador.usuarioId, set: { hash, actualizadoEn: new Date() } });
  await auditar({ accion: 'usuario.pin_cambiado', actor, objetivoTipo: 'usuario', objetivoId: id, ip });
}
