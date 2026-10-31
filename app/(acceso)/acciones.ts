'use server';

import { z } from 'zod';
import { email as esquemaEmail } from '@/dominio/texto-mail';
import { ipCliente } from '@/lib/sesion';
import { sistemaBloqueado } from '@/lib/servicio-belay';
import {
  entrar,
  pedirCodigoRecuperacion,
  restablecerContrasena,
  verificarCodigoRecuperacion,
  type ResultadoEntrar,
  type ResultadoPedirCodigo,
  type ResultadoRestablecer,
  type ResultadoVerificar,
} from '@/servidor/acceso';

// Login y recuperación quedan afuera del 423: alguien tiene que poder entrar a
// ver la pantalla de suspendido. Lo que sí se corta es la recuperación, que
// manda mails.

// Demo: «admin» entra como la cuenta de dueño con selector de vista; la contraseña («admin»)
// es la que dejó guardada la carga de la demo, y se verifica como cualquier otra.
const USUARIO_DEMO = 'admin';
const EMAIL_DEMO = 'info@belay.agency';

const datosEntrar = z.object({
  email: z.preprocess((v) => (typeof v === 'string' && v.trim().toLowerCase() === USUARIO_DEMO ? EMAIL_DEMO : v), esquemaEmail),
  contrasena: z.string().min(1).max(128),
  mantener: z.boolean(),
});

export async function accionEntrar(datos: unknown): Promise<ResultadoEntrar> {
  const validado = datosEntrar.safeParse(datos);
  if (!validado.success) return { ok: false, motivo: 'credenciales', intentosRestantes: 5 };
  const { email, contrasena, mantener } = validado.data;
  return entrar(email, contrasena, mantener, await ipCliente());
}

export async function accionPedirCodigo(email: unknown): Promise<ResultadoPedirCodigo> {
  if (await sistemaBloqueado()) return { ok: false, motivo: 'sin_envio' };
  const validado = esquemaEmail.safeParse(email);
  // Una dirección mal escrita recibe la misma respuesta que una que no existe.
  if (!validado.success) return { ok: true };
  return pedirCodigoRecuperacion(validado.data, await ipCliente());
}

const datosCodigo = z.object({ email: esquemaEmail, codigo: z.string().regex(/^[0-9]{6}$/) });

export async function accionVerificarCodigo(datos: unknown): Promise<ResultadoVerificar> {
  const validado = datosCodigo.safeParse(datos);
  if (!validado.success) return { ok: false, motivo: 'vencido' };
  return verificarCodigoRecuperacion(validado.data.email, validado.data.codigo, await ipCliente());
}

const datosRestablecer = datosCodigo.extend({ contrasena: z.string().max(128) });

export async function accionRestablecer(datos: unknown): Promise<ResultadoRestablecer> {
  const validado = datosRestablecer.safeParse(datos);
  if (!validado.success) return { ok: false, motivo: 'contrasena' };
  const { email, codigo, contrasena } = validado.data;
  return restablecerContrasena(email, codigo, contrasena, await ipCliente());
}
