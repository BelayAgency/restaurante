'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { email as esquemaEmail, nombrePersona } from '@/dominio/texto-mail';
import { ROLES } from '@/dominio/roles';
import { alternaVistas, ejecutar, exigirSesion, ipCliente, ErrorAcceso } from '@/lib/sesion';
import { auth } from '@/servidor/auth';
import { leerFacturacion } from '@/servidor/facturacion';
import {
  cambiarEstado,
  cambiarRol,
  cerrarSesiones,
  confirmarCambioCredencial,
  crearUsuario,
  editarNombrePropio,
  eliminarUsuario,
  enviarCodigoRecuperacion,
  establecerPin,
  iniciarCambioCredencial,
  listarUsuarios,
  verificarCambioCredencial,
} from '@/servidor/usuarios';

const id = z.string().min(1).max(64);
const rol = z.enum(ROLES);

export async function accionEditarNombre(nombre: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion();
    await editarNombrePropio(actor, nombrePersona.parse(nombre), await ipCliente());
    revalidatePath('/', 'layout');
  });
}

export async function accionIniciarCambio(objetivoId: unknown, tipo: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion();
    return iniciarCambioCredencial(actor, id.parse(objetivoId), z.enum(['email', 'contrasena']).parse(tipo), await ipCliente());
  });
}

export async function accionVerificarCambio(solicitudId: unknown, codigo: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion();
    await verificarCambioCredencial(actor, z.uuid().parse(solicitudId), z.string().regex(/^[0-9]{6}$/).parse(codigo));
  });
}

export async function accionConfirmarCambio(solicitudId: unknown, codigo: unknown, valor: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion();
    const texto = z.string().max(254).parse(valor);
    const resultado = await confirmarCambioCredencial(
      actor,
      z.uuid().parse(solicitudId),
      z.string().regex(/^[0-9]{6}$/).parse(codigo),
      texto,
      await ipCliente(),
    );
    // Cambiar la contraseña propia cierra todas las sesiones, ésta también; se
    // abre una nueva en este dispositivo para no echar a quien acaba de hacerlo.
    if (resultado.proposito === 'cambio_contrasena' && resultado.usuarioId === actor.id) {
      await auth.api
        .signInEmail({ body: { email: actor.email, password: texto, rememberMe: true }, headers: await headers() })
        .catch(() => undefined);
    }
    revalidatePath('/', 'layout');
  });
}

export async function accionCerrarSesiones(objetivoId: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion();
    await cerrarSesiones(actor, id.parse(objetivoId), await ipCliente());
  });
}

export async function accionEstablecerPin(objetivoId: unknown, pin: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion();
    await establecerPin(actor, id.parse(objetivoId), z.string().parse(pin), await ipCliente());
  });
}

const datosNuevoUsuario = z.object({
  nombre: nombrePersona,
  email: esquemaEmail,
  rol,
  contrasena: z.string().max(128),
});

export async function accionListarUsuarios() {
  return ejecutar(async () => listarUsuarios(await exigirSesion('usuarios.ver')));
}

export async function accionCrearUsuario(datos: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('usuarios.administrar');
    const nuevo = await crearUsuario(actor, datosNuevoUsuario.parse(datos), await ipCliente());
    return nuevo;
  });
}

export async function accionCambiarRol(objetivoId: unknown, nuevoRol: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('usuarios.administrar');
    await cambiarRol(actor, id.parse(objetivoId), rol.parse(nuevoRol), await ipCliente());
  });
}

export async function accionCambiarEstado(objetivoId: unknown, activo: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('usuarios.administrar');
    await cambiarEstado(actor, id.parse(objetivoId), z.boolean().parse(activo), await ipCliente());
  });
}

export async function accionEliminarUsuario(objetivoId: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('usuarios.administrar');
    await eliminarUsuario(actor, id.parse(objetivoId), await ipCliente());
  });
}

export async function accionEnviarCodigo(objetivoId: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion('usuarios.administrar');
    await enviarCodigoRecuperacion(actor, id.parse(objetivoId), await ipCliente());
  });
}

export async function accionFacturacion(offset: unknown) {
  return ejecutar(async () => {
    await exigirSesion('control.ver');
    return leerFacturacion(z.number().int().min(0).max(10_000).parse(offset));
  });
}

/**
 * Soporte alterna la vista de los roles para reproducir lo que ve cada uno.
 * Es la interfaz, no la identidad: lo que hace sigue a su nombre y con sus
 * permisos reales.
 */
export async function accionCambiarVista(vista: unknown) {
  return ejecutar(async () => {
    const actor = await exigirSesion();
    if (!alternaVistas(actor)) throw new ErrorAcceso(403, 'Sólo el dueño alterna vistas');
    const elegida = rol.parse(vista);
    const almacen = await cookies();
    if (elegida === actor.rol) almacen.delete('vista-rol');
    else almacen.set('vista-rol', elegida, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    revalidatePath('/', 'layout');
  });
}
