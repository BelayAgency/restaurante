import { describe, expect, it } from 'vitest';
import { hashearPin, verificarPin } from './pin';

describe('PIN', () => {
  it('verifica el correcto y rechaza otro', async () => {
    const guardado = await hashearPin('4821');
    expect(await verificarPin('4821', guardado)).toBe(true);
    expect(await verificarPin('4822', guardado)).toBe(false);
  });

  it('dos hashes del mismo PIN no coinciden (sal propia)', async () => {
    expect(await hashearPin('4821')).not.toBe(await hashearPin('4821'));
  });
});
