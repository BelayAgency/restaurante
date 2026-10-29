import { z } from 'zod';

/**
 * Texto que escribe un usuario y puede terminar adentro de un mail (prompt
 * base 13.1): los clientes de correo convierten cualquier dominio suelto en
 * un link, así que un nombre con forma de dirección vuelve un mail legítimo
 * de Belay en uno de phishing.
 */
const CON_FORMA_DE_LINK = /(:\/\/|www\.|@|[a-z0-9-]+\.[a-z]{2,}\b)/i;

export const nombrePersona = z
  .string()
  .trim()
  .min(1, 'Poné un nombre')
  .max(60, 'Máximo 60 caracteres')
  .refine((v) => !/[\r\n]/.test(v), 'Sin saltos de línea')
  .refine((v) => !CON_FORMA_DE_LINK.test(v), 'No puede contener direcciones ni links');

export const email = z.string().trim().toLowerCase().pipe(z.email('El email no es válido')).pipe(z.string().max(254));
