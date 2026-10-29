/**
 * PIN de operador. Se verifica también sin red, en el dispositivo, así que el
 * hash tiene que poder calcularse en el navegador: PBKDF2 de WebCrypto, que
 * existe igual en Node y no pide WASM. Un PIN de 6 dígitos con su hash a mano
 * se rompe por fuerza bruta: por eso el PIN no sirve para entrar al sistema,
 * sólo identifica a alguien dentro de un dispositivo ya registrado.
 */

const ITERACIONES = 210_000;

export const FORMATO_PIN = /^[0-9]{4,6}$/;

function aBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arreglo = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binario = '';
  for (const b of arreglo) binario += String.fromCharCode(b);
  return btoa(binario);
}

function deBase64(texto: string): Uint8Array<ArrayBuffer> {
  const binario = atob(texto);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function derivar(pin: string, sal: Uint8Array<ArrayBuffer>, iteraciones: number): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, clave, 256);
  return new Uint8Array(bits);
}

export async function hashearPin(pin: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const hash = await derivar(pin, sal, ITERACIONES);
  return `pbkdf2$${ITERACIONES}$${aBase64(sal)}$${aBase64(hash)}`;
}

export async function verificarPin(pin: string, guardado: string): Promise<boolean> {
  const [esquema, iteraciones, sal, hash] = guardado.split('$');
  if (esquema !== 'pbkdf2' || !iteraciones || !sal || !hash) return false;
  const calculado = await derivar(pin, deBase64(sal), Number(iteraciones));
  const esperado = deBase64(hash);
  if (calculado.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < calculado.length; i++) diferencia |= calculado[i]! ^ esperado[i]!;
  return diferencia === 0;
}
