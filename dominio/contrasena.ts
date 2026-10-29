/**
 * La política de contraseñas del sistema: la misma que el panel de la agencia.
 * Corre en el formulario (para mostrar los requisitos mientras se escribe) y
 * en el servidor al guardar.
 */

export interface RequisitoContrasena {
  texto: string;
  cumplido: boolean;
}

export function evaluarPassword(contrasena: string): RequisitoContrasena[] {
  return [
    { texto: '10 caracteres', cumplido: contrasena.length >= 10 },
    { texto: 'Una mayúscula', cumplido: /[A-ZÁÉÍÓÚÑ]/.test(contrasena) },
    { texto: 'Un número', cumplido: /[0-9]/.test(contrasena) },
    { texto: 'Un símbolo', cumplido: /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(contrasena) },
  ];
}

export function contrasenaValida(contrasena: string): boolean {
  return contrasena.length <= 128 && evaluarPassword(contrasena).every((r) => r.cumplido);
}
